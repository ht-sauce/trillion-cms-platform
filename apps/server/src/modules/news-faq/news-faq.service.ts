/**
 * 新闻 / 问答管理服务（表驱动）
 *
 * 新闻与问答的管理源是 NewsArticle / FaqItem 独立数据表（表为管理源，页面是发布产物）。
 * 本服务做管理面 CRUD：写表 → 委托 NewsFaqSyncService 用表数据构建/更新详情页标准块组合
 * （article-meta/article-body、faq-detail）并创建或补建 Page → 整体重算派生块
 * （/news、/faq 列表页 + 同分类详情页 related-faq）→ 自动触发页面级发布。
 *
 * 约定：
 * - 保存即发布（status 直接 published，管理端保存免审核，与站点编辑器保存行为一致）
 * - 发布走 PublishService.enqueue 的系统入口（构建中允许排队），接口响应携带
 *   affectedPages（受影响页面）与 publishTaskId（发布任务标识）
 * - slug 创建后不可修改（编辑 DTO 不收 slug），访问地址 path=/news/{slug}、/faq/{slug} 由 slug 拼出
 * - 详情页 Page 与表记录按 pageId 弱关联：pageId 为空或页面缺失时，编辑会按 slug 补建/挂接页面
 * - 站点访问边界沿用 site-scope：assertSiteAccess 越权即 403；详情直读表按 row.siteId 归属鉴权
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { PublishService } from '../publish/publish.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import {
  parseFaqSeq,
  pad3,
  splitParagraphs,
  truncate,
  NewsFaqSyncService,
  type BlockInstanceInput
} from './news-faq-sync.service'
import type { CreateArticleDto, CreateFaqDto, UpdateArticleDto, UpdateFaqDto } from './dto'

/** 新建问答/文章时页面摘要的截断长度（summary 列上限 512） */
const SUMMARY_MAX = 200

/** 新闻/问答列表项（path 由 slug 拼出，pageId 为发布产物页面） */
interface ArticleRow {
  id: string
  path: string
  title: string
  summary: string
  publishDate: string
  status: string
  pageId: string | null
}

interface FaqRow {
  id: string
  path: string
  question: string
  category: string
  status: string
  pageId: string | null
}

@Injectable()
export class NewsFaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService,
    private readonly sync: NewsFaqSyncService,
    private readonly publish: PublishService
  ) {}

  // ---------------- 新闻资讯 ----------------

  /** 文章分页列表（读 NewsArticle 表，按发布日期倒序，keyword 模糊匹配标题） */
  async listArticles(user: AuthUser, siteId: string, page: number, pageSize: number, keyword?: string) {
    const id = siteId
    assertSiteAccess(user, id)

    const where: Record<string, unknown> = { siteId: id }
    if (keyword) where.title = { contains: keyword }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.newsArticle.findMany({
        where,
        orderBy: [{ publishDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.newsArticle.count({ where })
    ])

    const list: ArticleRow[] = rows.map((row) => ({
      id: row.id,
      path: joinPath('/news', row.slug),
      title: row.title,
      summary: row.summary,
      publishDate: row.publishDate,
      status: row.status,
      pageId: row.pageId
    }))

    return { list, total, page, pageSize }
  }

  /** 单条文章详情（纯读，直读表；鉴权按 row.siteId 归属，不接收 siteId 参数） */
  async getArticleDetail(user: AuthUser, id: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('文章不存在')
    assertSiteAccess(user, row.siteId)

    return {
      id: row.id,
      pageId: row.pageId,
      path: joinPath('/news', row.slug),
      title: row.title,
      summary: row.summary,
      publishDate: row.publishDate,
      status: row.status,
      slug: row.slug,
      content: row.content
    }
  }

  /** 新建文章：写表 → 创建详情页（保存即发布）→ 重算 /news 列表页 → 自动发布 */
  async createArticle(user: AuthUser, dto: CreateArticleDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    const channel = await this.resolveSectionChannel(siteId, '/news', '新闻资讯')

    const slug = dto.slug ? dto.slug : await this.autoArticleSlug(siteId, dto.publishDate)
    /** 表内 slug 判重（[siteId, slug] 唯一约束前置拦截，避免落到 Prisma P2002 变 500） */
    const slugTaken = await this.prisma.newsArticle.findUnique({
      where: { siteId_slug: { siteId, slug } },
      select: { id: true }
    })
    if (slugTaken) throw new BadRequestException(`已存在相同 slug 的文章：${slug}`)
    await this.assertPathFree(siteId, joinPath(channel.path, slug))

    const paragraphs = splitParagraphs(dto.content)
    const summary = dto.summary?.trim() || truncate(paragraphs.join(''), SUMMARY_MAX)

    const row = await this.prisma.newsArticle.create({
      data: {
        siteId,
        title: dto.title,
        summary,
        content: dto.content,
        publishDate: dto.publishDate,
        slug,
        /** 管理端保存免审核：直接发布态 */
        status: 'published'
      }
    })

    const blocks = this.sync.buildArticleDetailBlocks({
      title: dto.title,
      summary,
      publishDate: dto.publishDate,
      paragraphs
    })
    const pageId = await this.ensureDetailPage({
      siteId,
      section: '/news',
      label: '新闻资讯',
      slug,
      title: dto.title,
      summary,
      status: row.status,
      blocks
    })
    await this.prisma.newsArticle.update({ where: { id: row.id }, data: { pageId } })

    const affectedPages = await this.sync.syncAfterArticleChange(siteId, [pageId])
    const publishTaskId = await this.publishAffected(user, siteId, affectedPages)
    return { id: row.id, pageId, path: joinPath('/news', slug), affectedPages, publishTaskId }
  }

  /**
   * 编辑文章：更新表 → 更新关联 Page（title/summary、article-meta.date、article-body 段落；
   * pageId 空或页面缺失则补建）→ 重算 /news 列表页 → 自动发布。slug 创建后不可改（DTO 不收）。
   */
  async updateArticle(user: AuthUser, id: string, dto: UpdateArticleDto) {
    const row = await this.prisma.newsArticle.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('文章不存在')
    assertSiteAccess(user, row.siteId)

    const title = dto.title ?? row.title
    const summary = dto.summary !== undefined ? dto.summary : row.summary
    const publishDate = dto.publishDate ?? row.publishDate
    const content = dto.content !== undefined ? dto.content : row.content

    await this.prisma.newsArticle.update({
      where: { id: row.id },
      data: { title, summary, publishDate, content }
    })

    const paragraphs = splitParagraphs(content)
    const blocks = this.sync.buildArticleDetailBlocks({ title, summary, publishDate, paragraphs })
    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/news/')
    let pageId: string
    if (linked) {
      await this.prisma.page.update({
        where: { id: linked.id },
        data: { title, summary, blocks: toJsonInput(blocks) }
      })
      pageId = linked.id
    } else {
      pageId = await this.ensureDetailPage({
        siteId: row.siteId,
        section: '/news',
        label: '新闻资讯',
        slug: row.slug,
        title,
        summary,
        status: row.status,
        blocks
      })
      await this.prisma.newsArticle.update({ where: { id: row.id }, data: { pageId } })
    }
    await this.editor.refreshContentHash(pageId)

    const affectedPages = await this.sync.syncAfterArticleChange(row.siteId, [pageId])
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, pageId, affectedPages, publishTaskId }
  }

  /** 删除文章：删关联 Page（发布产物）→ 删表记录 → 重算 /news 列表页 → 自动发布 */
  async removeArticle(user: AuthUser, id: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('文章不存在')
    assertSiteAccess(user, row.siteId)

    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/news/')
    if (linked) await this.prisma.page.delete({ where: { id: linked.id } })
    await this.prisma.newsArticle.delete({ where: { id: row.id } })

    const affectedPages = await this.sync.syncAfterArticleChange(row.siteId, [])
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, pageId: linked?.id ?? null, affectedPages, publishTaskId }
  }

  // ---------------- 高频问答 ----------------

  /** 问答分页列表（读 FaqItem 表，按 slug 倒序——新增序号最大恒排最前；keyword 模糊匹配问题，支持分类过滤） */
  async listFaqs(user: AuthUser, siteId: string, page: number, pageSize: number, keyword?: string, category?: string) {
    const id = siteId
    assertSiteAccess(user, id)

    const where: Record<string, unknown> = { siteId: id }
    if (keyword) where.question = { contains: keyword }
    if (category) where.category = category

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.faqItem.findMany({
        where,
        orderBy: { slug: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.faqItem.count({ where })
    ])

    const list: FaqRow[] = rows.map((row) => ({
      id: row.id,
      path: joinPath('/faq', row.slug),
      question: row.question,
      category: row.category,
      status: row.status,
      pageId: row.pageId
    }))

    return { list, total, page, pageSize }
  }

  /** 问答分类清单（FaqItem 表 category 去重，按首次出现顺序，与列表页分组口径一致） */
  async listCategories(user: AuthUser, siteId: string) {
    const id = siteId
    assertSiteAccess(user, id)

    const rows = await this.prisma.faqItem.findMany({
      where: { siteId: id },
      orderBy: { id: 'asc' },
      select: { category: true }
    })
    const list: string[] = []
    for (const row of rows) {
      if (row.category && !list.includes(row.category)) list.push(row.category)
    }
    return { list }
  }

  /** 单条问答详情（纯读，直读表；鉴权按 row.siteId 归属，不接收 siteId 参数） */
  async getFaqDetail(user: AuthUser, id: string) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    return {
      id: row.id,
      pageId: row.pageId,
      path: joinPath('/faq', row.slug),
      question: row.question,
      category: row.category,
      status: row.status,
      slug: row.slug,
      answer: row.answer
    }
  }

  /** 新建问答：路径 = /faq/q{三位序号}（表内现有最大序号 + 1）→ 重算列表页与同分类 related-faq → 自动发布 */
  async createFaq(user: AuthUser, dto: CreateFaqDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    const channel = await this.resolveSectionChannel(siteId, '/faq', '高频问答')

    const slug = await this.autoFaqSlug(siteId)
    await this.assertPathFree(siteId, joinPath(channel.path, slug))

    const paragraphs = splitParagraphs(dto.answer)
    const summary = truncate(paragraphs.join(''), SUMMARY_MAX)

    const row = await this.prisma.faqItem.create({
      data: {
        siteId,
        question: dto.question,
        category: dto.category,
        answer: dto.answer,
        slug,
        /** 管理端保存免审核：直接发布态 */
        status: 'published'
      }
    })

    const related = (await this.sync.loadFaqDetails(siteId)).filter(
      (item) => item.category === dto.category && item.id !== row.id
    )
    const blocks = this.sync.buildFaqDetailBlocks({
      question: dto.question,
      category: dto.category,
      paragraphs,
      related
    })
    const pageId = await this.ensureDetailPage({
      siteId,
      section: '/faq',
      label: '高频问答',
      slug,
      title: dto.question,
      summary,
      status: row.status,
      blocks
    })
    await this.prisma.faqItem.update({ where: { id: row.id }, data: { pageId } })

    const affectedPages = await this.sync.syncAfterFaqChange(siteId, [pageId], [dto.category])
    const publishTaskId = await this.publishAffected(user, siteId, affectedPages)
    return { id: row.id, pageId, path: joinPath('/faq', slug), affectedPages, publishTaskId }
  }

  /**
   * 编辑问答：更新表 → 更新 faq-detail 整块（pageId 空或页面缺失则补建）
   * → 重算新旧分类的列表页与 related-faq → 自动发布。slug 创建后不可改（DTO 不收）。
   */
  async updateFaq(user: AuthUser, id: string, dto: UpdateFaqDto) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    const oldCategory = row.category
    const question = dto.question ?? row.question
    const category = dto.category ?? row.category
    const answer = dto.answer !== undefined ? dto.answer : row.answer

    await this.prisma.faqItem.update({
      where: { id: row.id },
      data: { question, category, answer }
    })

    const paragraphs = splitParagraphs(answer)
    const summary = truncate(paragraphs.join(''), SUMMARY_MAX)
    const related = (await this.sync.loadFaqDetails(row.siteId)).filter(
      (item) => item.category === category && item.id !== row.id
    )
    const blocks = this.sync.buildFaqDetailBlocks({ question, category, paragraphs, related })

    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/faq/q')
    let pageId: string
    if (linked) {
      /** 答案变化时同步摘要，保持 meta description 与正文一致 */
      await this.prisma.page.update({
        where: { id: linked.id },
        data: { title: question, summary, blocks: toJsonInput(blocks) }
      })
      pageId = linked.id
    } else {
      pageId = await this.ensureDetailPage({
        siteId: row.siteId,
        section: '/faq',
        label: '高频问答',
        slug: row.slug,
        title: question,
        summary,
        status: row.status,
        blocks
      })
      await this.prisma.faqItem.update({ where: { id: row.id }, data: { pageId } })
    }
    await this.editor.refreshContentHash(pageId)

    const categories = [...new Set([oldCategory, category].filter(Boolean))]
    const affectedPages = await this.sync.syncAfterFaqChange(row.siteId, [pageId], categories)
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, pageId, affectedPages, publishTaskId }
  }

  /** 删除问答：删关联 Page（发布产物）→ 删表记录 → 重算列表页与该分类 related-faq → 自动发布 */
  async removeFaq(user: AuthUser, id: string) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/faq/q')
    if (linked) await this.prisma.page.delete({ where: { id: linked.id } })
    await this.prisma.faqItem.delete({ where: { id: row.id } })

    const affectedPages = await this.sync.syncAfterFaqChange(row.siteId, [], [row.category])
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, pageId: linked?.id ?? null, affectedPages, publishTaskId }
  }

  // ---------------- 内部 ----------------

  /**
   * 受影响页面的页面级自动发布（系统入口：构建中允许排队）
   * 仅 SSG 站点需要构建；只发布其中已发布状态的页面；返回发布任务 id（无需发布时为 null）
   */
  private async publishAffected(user: AuthUser, siteId: string, pageIds: string[]): Promise<string | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, renderMode: true }
    })
    if (!site || site.renderMode !== 'ssg') return null
    const targets = await this.prisma.page.findMany({
      where: { id: { in: pageIds }, siteId, status: 'published' },
      select: { id: true }
    })
    if (!targets.length) return null
    const task = await this.publish.enqueue(
      user,
      siteId,
      'page',
      { pageIds: targets.map((item) => item.id) },
      { allowQueueWhenBusy: true }
    )
    return task.id
  }

  /**
   * 解析新闻/问答所属目录：列表页（/news、/faq）是对应目录的 index 落地页，
   * 其 channelId 即详情页所属目录；无列表页时兜底取任一详情页的目录
   */
  private async resolveSectionChannel(siteId: string, listPath: string, label: string) {
    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: listPath },
      select: { channelId: true }
    })
    if (listPage) {
      const channel = await this.prisma.channel.findUnique({ where: { id: listPage.channelId } })
      if (channel) return channel
    }
    const anyDetail = await this.prisma.page.findFirst({
      where: { siteId, path: { startsWith: `${listPath}/` } },
      select: { channelId: true }
    })
    if (anyDetail) {
      const channel = await this.prisma.channel.findUnique({ where: { id: anyDetail.channelId } })
      if (channel) return channel
    }
    throw new BadRequestException(`未找到「${label}」（${listPath}）栏目，无法创建内容`)
  }

  /** 文章 slug 自动生成：news-YYYYMMDD-序号（表内从 1 递增直到可用） */
  private async autoArticleSlug(siteId: string, publishDate: string): Promise<string> {
    const datePart = publishDate.replaceAll('-', '')
    let index = 1
    for (;;) {
      const candidate = `news-${datePart}-${index}`
      const exists = await this.prisma.newsArticle.findFirst({
        where: { siteId, slug: candidate },
        select: { id: true }
      })
      if (!exists) return candidate
      index += 1
    }
  }

  /** 下一个问答全局序号：表内现有 qN 最大序号 + 1 */
  private async autoFaqSlug(siteId: string): Promise<string> {
    const rows = await this.prisma.faqItem.findMany({ where: { siteId }, select: { slug: true } })
    const max = rows.reduce((acc, row) => Math.max(acc, parseFaqSeq(row.slug)), 0)
    return `q${pad3(max + 1)}`
  }

  /** 访问地址占用校验（Page 按 [siteId, path] 唯一，新建入口前置拦截） */
  private async assertPathFree(siteId: string, path: string) {
    const exists = await this.prisma.page.findFirst({ where: { siteId, path }, select: { id: true } })
    if (exists) throw new BadRequestException(`已存在相同访问地址的页面：${path}`)
  }

  /** 表记录的关联页面：pageId 有效且页面归属同站点、路径属对应栏目；失联视为缺失（走补建） */
  private async findLinkedPage(pageId: string | null, siteId: string, pathPrefix: string) {
    if (pageId == null) return null
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page || page.siteId !== siteId || !page.path?.startsWith(pathPrefix)) return null
    return page
  }

  /**
   * 确保发布产物详情页存在：按 slug 拼地址，命中既有页面则原位重写内容（挂接失联产物），
   * 否则创建详情页（保存即发布）；返回页面 id
   */
  private async ensureDetailPage(input: {
    siteId: string
    section: '/news' | '/faq'
    label: string
    slug: string
    title: string
    summary: string
    status: string
    blocks: BlockInstanceInput[]
  }): Promise<string> {
    const channel = await this.resolveSectionChannel(input.siteId, input.section, input.label)
    const path = joinPath(channel.path, input.slug)

    const existing = await this.prisma.page.findFirst({ where: { siteId: input.siteId, path } })
    if (existing) {
      await this.prisma.page.update({
        where: { id: existing.id },
        data: { title: input.title, summary: input.summary, blocks: toJsonInput(input.blocks) }
      })
      await this.editor.refreshContentHash(existing.id)
      return existing.id
    }

    const created = await this.prisma.page.create({
      data: {
        siteId: input.siteId,
        channelId: channel.id,
        templateId: 'default',
        title: input.title,
        slug: input.slug,
        path,
        kind: 'detail',
        status: input.status,
        /** 三态流转到 published 时写入发布时间（与内容编辑口径一致） */
        ...(input.status === 'published' ? { publishedAt: new Date() } : {}),
        summary: input.summary,
        blocks: toJsonInput(input.blocks),
        sort: await this.nextPageSort(input.siteId, channel.id)
      }
    })
    await this.editor.refreshContentHash(created.id)
    return created.id
  }

  /** 目录内下一个排序值（与编辑器口径一致：现有最大 sort + 1） */
  private async nextPageSort(siteId: string, channelId: string): Promise<number> {
    const max = await this.prisma.page.aggregate({ where: { siteId, channelId }, _max: { sort: true } })
    return (max._max.sort ?? 0) + 1
  }
}
