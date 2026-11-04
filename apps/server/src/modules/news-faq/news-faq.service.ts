/**
 * 新闻 / 问答管理服务（表驱动）
 *
 * 新闻与问答的管理源是 NewsArticle / FaqItem 独立数据表（表为管理源，页面是发布产物）。
 * 本服务做管理面 CRUD：写表 → 委托 NewsFaqSyncService 以站点既有详情页为结构模板、
 * 用表数据构建/更新详情页块组合，并创建或补建 Page → 整体重算派生块
 * （/news、/faq 列表页 + 同分类详情页的相关问答）→ 自动触发页面级发布。
 * 详情页的固定文案（telbar / notice / disclaimer）全部来自模板页，代码不含站点文案。
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
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { PublishService } from '../publish/publish.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import { articleBlocksToText, normalizeArticleBody } from '../../common/utils/article-body'
import { articleBlocksToHtml, htmlToText, sanitizeArticleHtml } from '../../common/utils/article-html'
import type { BlockInstanceInput } from '../../common/utils/block-instances'
import {
  RELATED_FAQ_MAX,
  faqAnswerText,
  parseFaqSeq,
  pad3,
  splitParagraphs,
  truncate,
  NewsFaqSyncService
} from './news-faq-sync.service'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import { resolveFaqAnswer } from '../../common/utils/faq-answer'
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
  cover?: string | null
}

interface FaqRow {
  id: string
  path: string
  question: string
  category: string
  status: string
  /** 是否在列表页上架展示（false = 仅保留详情页） */
  featured: boolean
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
      pageId: row.pageId,
      cover: row.cover
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
      content: row.content,
      /** 正文整篇 HTML（主数据；历史文章由块数组转换，前端只处理 HTML） */
      bodyHtml: row.bodyHtml ?? articleBlocksToHtml(normalizeArticleBody(row.body)),
      /** 结构化正文块（历史兼容，仅回显对照，前端不再用于渲染） */
      body: Array.isArray(row.body) ? row.body : [],
      cover: row.cover
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

    const paragraphs = splitParagraphs(dto.content ?? '')
    const body = normalizeArticleBody(dto.body)
    /** 正文整篇 HTML 是主数据；纯文本由它派生（无 HTML 时回落块数组 / content） */
    const bodyHtml = sanitizeArticleHtml(dto.bodyHtml)
    const plainText = bodyHtml ? htmlToText(bodyHtml) : body.length ? articleBlocksToText(body) : paragraphs.join('\n')
    const resolvedParagraphs = splitParagraphs(plainText)
    if (!plainText.trim()) throw new BadRequestException('正文不能为空')
    const summary = dto.summary?.trim() || truncate(resolvedParagraphs.join(''), SUMMARY_MAX)

    const row = await this.prisma.newsArticle.create({
      data: {
        siteId,
        title: dto.title,
        summary,
        content: plainText,
        bodyHtml: bodyHtml || null,
        body: body.length ? toJsonInput(body) : undefined,
        cover: dto.cover || null,
        publishDate: dto.publishDate,
        slug,
        /** 管理端保存免审核：直接发布态 */
        status: 'published'
      }
    })

    const template = await this.sync.loadDetailTemplate(siteId, '/news')
    const blocks = this.sync.buildArticleDetailBlocks(
      {
        title: dto.title,
        summary,
        publishDate: dto.publishDate,
        paragraphs: resolvedParagraphs,
        body,
        bodyHtml,
        cover: dto.cover
      },
      template
    )
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
    /** 正文：bodyHtml 是主数据（传了就整体覆盖），纯文本 content 由它派生；无 HTML 时回落块数组 */
    const bodyHtml = dto.bodyHtml !== undefined ? sanitizeArticleHtml(dto.bodyHtml) : (row.bodyHtml ?? '')
    const body = dto.body !== undefined ? normalizeArticleBody(dto.body) : normalizeArticleBody(row.body)
    const content = bodyHtml
      ? htmlToText(bodyHtml)
      : body.length
        ? articleBlocksToText(body)
        : dto.content !== undefined
          ? dto.content
          : row.content
    const paragraphs = splitParagraphs(content)
    /** 封面：传 null = 显式清空（回落模板背景） */
    const cover = dto.cover !== undefined ? dto.cover : row.cover

    await this.prisma.newsArticle.update({
      where: { id: row.id },
      data: {
        title,
        summary,
        publishDate,
        content,
        bodyHtml: bodyHtml || null,
        body: body.length ? toJsonInput(body) : Prisma.DbNull,
        cover
      }
    })

    const template = await this.sync.loadDetailTemplate(row.siteId, '/news')
    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/news/')
    let pageId: string
    if (linked) {
      const blocks = this.sync.buildArticleDetailBlocks(
        { title, summary, publishDate, paragraphs, body, bodyHtml, cover },
        template,
        linked.blocks
      )
      await this.prisma.page.update({
        where: { id: linked.id },
        data: { title, summary, blocks: toJsonInput(blocks) }
      })
      pageId = linked.id
    } else {
      const blocks = this.sync.buildArticleDetailBlocks(
        { title, summary, publishDate, paragraphs, body, bodyHtml, cover },
        template
      )
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

  // ---------------- 常见问题（问答） ----------------

  /**
   * 问答分页列表（读 FaqItem 表，按 slug 倒序——新增序号最大恒排最前）
   * keyword 模糊匹配问题，支持分类过滤与上架状态过滤（featured 传 undefined 表示不限）
   */
  async listFaqs(
    user: AuthUser,
    siteId: string,
    page: number,
    pageSize: number,
    keyword?: string,
    category?: string,
    featured?: boolean
  ) {
    const id = siteId
    assertSiteAccess(user, id)

    const where: Record<string, unknown> = { siteId: id }
    if (keyword) where.question = { contains: keyword }
    if (category) where.category = category
    if (typeof featured === 'boolean') where.featured = featured

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
      featured: row.featured,
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
      featured: row.featured,
      slug: row.slug,
      answer: row.answer,
      /** 富文本答案（后台编辑器回显用；为空表示历史数据只有纯文本） */
      answerHtml: row.answerHtml ?? ''
    }
  }

  /** 新建问答：路径 = /faq/q{三位序号}（表内现有最大序号 + 1）→ 重算列表页与同分类 related-faq → 自动发布 */
  async createFaq(user: AuthUser, dto: CreateFaqDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    const channel = await this.resolveSectionChannel(siteId, '/faq', '常见问题')

    const slug = await this.autoFaqSlug(siteId)
    await this.assertPathFree(siteId, joinPath(channel.path, slug))

    /** 答案结构化：answerHtml 优先（富文本），只给纯文本时按编号规则还原列表结构（ADR-058） */
    const resolved = resolveFaqAnswer({ answer: dto.answer, answerHtml: dto.answerHtml })
    if (!resolved.answer.trim()) throw new BadRequestException('答案不能为空')
    const paragraphs = splitParagraphs(resolved.answer)
    const summary = truncate(paragraphs.join(''), SUMMARY_MAX)

    const row = await this.prisma.faqItem.create({
      data: {
        siteId,
        question: dto.question,
        category: dto.category,
        answer: resolved.answer,
        answerHtml: resolved.answerHtml || null,
        slug,
        /** 列表页上架展示：缺省 true（新建即进列表，与改动前口径一致） */
        featured: dto.featured ?? true,
        /** 管理端保存免审核：直接发布态 */
        status: 'published'
      }
    })

    /** 新建问答还没有手工关联，走「同分类其它问答」自动口径 */
    const related = this.sync.resolveRelated(
      { id: row.id, category: dto.category, relatedIds: [] },
      await this.sync.loadFaqDetails(siteId)
    )
    const template = await this.sync.loadDetailTemplate(siteId, '/faq')
    const blocks = this.sync.buildFaqDetailBlocks(
      { question: dto.question, category: dto.category, paragraphs, answerHtml: resolved.answerHtml, related },
      template
    )
    const pageId = await this.ensureDetailPage({
      siteId,
      section: '/faq',
      label: '常见问题',
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
    /**
     * 答案结构化（ADR-058）：
     *   传了 answerHtml → 以它为准派生纯文本；只传 answer（纯文本）→ 按编号规则重新还原结构；
     *   都没传 → 沿用库里既有值（编辑问题/分类时不动答案）
     */
    const resolved =
      dto.answerHtml !== undefined
        ? resolveFaqAnswer({ answerHtml: dto.answerHtml })
        : dto.answer !== undefined
          ? resolveFaqAnswer({ answer: dto.answer })
          : { answer: row.answer, answerHtml: row.answerHtml ?? '' }
    const answer = resolved.answer
    const featured = dto.featured ?? row.featured

    await this.prisma.faqItem.update({
      where: { id: row.id },
      data: { question, category, answer, answerHtml: resolved.answerHtml || null, featured }
    })

    const paragraphs = splitParagraphs(answer)
    const summary = truncate(paragraphs.join(''), SUMMARY_MAX)
    /** 关联问题：手工指定的优先，没指定才回落同分类（ADR-057） */
    const related = this.sync.resolveRelated(
      { id: row.id, category, relatedIds: this.normalizeRelatedIds(row.relatedIds) },
      await this.sync.loadFaqDetails(row.siteId)
    )
    const template = await this.sync.loadDetailTemplate(row.siteId, '/faq')

    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/faq/')
    let pageId: string
    if (linked) {
      const blocks = this.sync.buildFaqDetailBlocks(
        { question, category, paragraphs, answerHtml: resolved.answerHtml, related },
        template,
        linked.blocks
      )
      /** 答案变化时同步摘要，保持 meta description 与正文一致 */
      await this.prisma.page.update({
        where: { id: linked.id },
        data: { title: question, summary, blocks: toJsonInput(blocks) }
      })
      pageId = linked.id
    } else {
      const blocks = this.sync.buildFaqDetailBlocks(
        { question, category, paragraphs, answerHtml: resolved.answerHtml, related },
        template
      )
      pageId = await this.ensureDetailPage({
        siteId: row.siteId,
        section: '/faq',
        label: '常见问题',
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

  /**
   * 上架状态切换（列表页开关专用）：只改 featured 列 → 重算 /faq 列表页 → 发布
   * 与 updateFaq 的区别：不重写详情页（问题/分类/答案未变），页面上该问答仍可访问，
   * 只是从「分类区块 + 全部问题列表」里收起来。分类未变，related-faq 也无需重算。
   */
  async setFaqFeatured(user: AuthUser, id: string, featured: boolean) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    if (row.featured !== featured) {
      await this.prisma.faqItem.update({ where: { id: row.id }, data: { featured } })
    }

    const affectedPages = await this.sync.syncAfterFaqChange(row.siteId, [], [])
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, featured, affectedPages, publishTaskId }
  }

  /**
   * 关联问题读取（管理端「关联问题」弹窗回显）：
   * 返回手工指定的 id 列表；未指定时返回当下自动口径实际命中的 id，并标 auto=true，
   * 运营打开弹窗看到的就是线上那一组，不是空白。
   */
  async getFaqRelated(user: AuthUser, id: string) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    const all = await this.sync.loadFaqDetails(row.siteId)
    const manualIds = this.normalizeRelatedIds(row.relatedIds)
    const resolved = this.sync.resolveRelated({ id: row.id, category: row.category, relatedIds: manualIds }, all)

    return {
      id: row.id,
      /** 是否已手工指定（false = 当前用的是「同分类其它问答」自动口径） */
      auto: manualIds.length === 0,
      ids: resolved.slice(0, RELATED_FAQ_MAX).map((item) => item.id),
      /** 渲染顺序的问答摘要（弹窗右侧已选列表用） */
      items: resolved.slice(0, RELATED_FAQ_MAX).map((item) => ({
        id: item.id,
        question: item.question,
        category: item.category
      }))
    }
  }

  /**
   * 关联问题保存：覆盖手工列表（空数组合法＝恢复自动口径）
   * 校验：必须同站点、排除自身、去重、上限 RELATED_FAQ_MAX；
   * 保存后只重算**这一条**详情页的 faq-list 并发布（列表页不受影响）。
   */
  async setFaqRelated(user: AuthUser, id: string, ids: string[]) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    const unique = [...new Set(ids.filter((value) => value && value !== row.id))]
    if (unique.length > RELATED_FAQ_MAX) {
      throw new BadRequestException(`关联问题最多 ${RELATED_FAQ_MAX} 条`)
    }
    const owned = await this.prisma.faqItem.findMany({
      where: { id: { in: unique }, siteId: row.siteId },
      select: { id: true }
    })
    if (owned.length !== unique.length) throw new BadRequestException('包含不属于本站点的问答')

    await this.prisma.faqItem.update({
      where: { id: row.id },
      data: { relatedIds: unique.length ? toJsonInput(unique) : Prisma.DbNull }
    })

    const all = await this.sync.loadFaqDetails(row.siteId)
    const detail = all.find((item) => item.id === row.id)
    let affectedPages: string[] = []
    if (detail?.pageId) {
      const page = await this.prisma.page.findUnique({
        where: { id: detail.pageId },
        select: { id: true, blocks: true }
      })
      if (page) {
        const items = this.sync
          .resolveRelated({ id: row.id, category: row.category, relatedIds: unique }, all)
          .slice(0, RELATED_FAQ_MAX)
          .map((item) => ({ q: item.question, a: faqAnswerText(item.paragraphs), h: item.answerHtml }))
        const next = normalizeBlockInstances(page.blocks).map((inst) =>
          inst.key === 'faq-list' ? { ...inst, data: { ...inst.data, items } } : inst
        )
        await this.prisma.page.update({ where: { id: page.id }, data: { blocks: toJsonInput(next) } })
        await this.editor.refreshContentHash(page.id)
        affectedPages = [page.id]
      }
    }

    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, ids: unique, auto: unique.length === 0, affectedPages, publishTaskId }
  }

  /** relatedIds JSON 列归一化：只认字符串数组，其余（null / 脏数据）视为未指定 */
  private normalizeRelatedIds(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  }

  /** 删除问答：删关联 Page（发布产物）→ 删表记录 → 重算列表页与该分类 related-faq → 自动发布 */
  async removeFaq(user: AuthUser, id: string) {
    const row = await this.prisma.faqItem.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('问答不存在')
    assertSiteAccess(user, row.siteId)

    const linked = await this.findLinkedPage(row.pageId, row.siteId, '/faq/')
    if (linked) await this.prisma.page.delete({ where: { id: linked.id } })
    await this.prisma.faqItem.delete({ where: { id: row.id } })

    const affectedPages = await this.sync.syncAfterFaqChange(row.siteId, [], [row.category])
    const publishTaskId = await this.publishAffected(user, row.siteId, affectedPages)
    return { id: row.id, pageId: linked?.id ?? null, affectedPages, publishTaskId }
  }

  // ---------------- 批量重建 ----------------

  /**
   * 批量重建派生页面（数据导入 / 修复用）：为全部表记录补建或刷新详情页，
   * 重算 /news 与 /faq 两个列表页，最后**统一发布一次**——避免逐条导入触发 N 次构建。
   */
  async rebuild(user: AuthUser, siteId: string) {
    assertSiteAccess(user, siteId)
    const newsTemplate = await this.sync.loadDetailTemplate(siteId, '/news')
    const faqTemplate = await this.sync.loadDetailTemplate(siteId, '/faq')

    // 1) 新闻：逐条补建/刷新详情页
    const newsPageIds: string[] = []
    const articles = await this.prisma.newsArticle.findMany({ where: { siteId }, orderBy: { publishDate: 'asc' } })
    for (const row of articles) {
      const bodyHtml = row.bodyHtml ?? ''
      const paragraphs = splitParagraphs(bodyHtml ? htmlToText(bodyHtml) : row.content)
      const body = normalizeArticleBody(row.body)
      const linked = await this.findLinkedPage(row.pageId, siteId, '/news/')
      const input = {
        title: row.title,
        summary: row.summary,
        publishDate: row.publishDate,
        paragraphs,
        body,
        bodyHtml: row.bodyHtml ?? '',
        cover: row.cover
      }
      if (linked) {
        const blocks = this.sync.buildArticleDetailBlocks(input, newsTemplate, linked.blocks)
        await this.prisma.page.update({
          where: { id: linked.id },
          data: { title: row.title, summary: row.summary, blocks: toJsonInput(blocks) }
        })
        newsPageIds.push(linked.id)
      } else {
        const blocks = this.sync.buildArticleDetailBlocks(input, newsTemplate)
        const pageId = await this.ensureDetailPage({
          siteId,
          section: '/news',
          label: '新闻资讯',
          slug: row.slug,
          title: row.title,
          summary: row.summary,
          status: row.status,
          blocks
        })
        await this.prisma.newsArticle.update({ where: { id: row.id }, data: { pageId } })
        newsPageIds.push(pageId)
      }
    }

    // 2) 问答：逐条补建/刷新详情页（related 按分类从表反查）
    const faqPageIds: string[] = []
    const faqDetails = await this.sync.loadFaqDetails(siteId)
    const faqs = await this.prisma.faqItem.findMany({ where: { siteId }, orderBy: { slug: 'asc' } })
    for (const row of faqs) {
      const paragraphs = splitParagraphs(row.answer)
      const related = this.sync.resolveRelated(
        { id: row.id, category: row.category, relatedIds: this.normalizeRelatedIds(row.relatedIds) },
        faqDetails
      )
      const linked = await this.findLinkedPage(row.pageId, siteId, '/faq/')
      const input = {
        question: row.question,
        category: row.category,
        paragraphs,
        answerHtml: row.answerHtml ?? '',
        related
      }
      if (linked) {
        const blocks = this.sync.buildFaqDetailBlocks(input, faqTemplate, linked.blocks)
        await this.prisma.page.update({
          where: { id: linked.id },
          data: { title: row.question, blocks: toJsonInput(blocks) }
        })
        faqPageIds.push(linked.id)
      } else {
        const blocks = this.sync.buildFaqDetailBlocks(input, faqTemplate)
        const summary = truncate(paragraphs.join(''), SUMMARY_MAX)
        const pageId = await this.ensureDetailPage({
          siteId,
          section: '/faq',
          label: '常见问题',
          slug: row.slug,
          title: row.question,
          summary,
          status: row.status,
          blocks
        })
        await this.prisma.faqItem.update({ where: { id: row.id }, data: { pageId } })
        faqPageIds.push(pageId)
      }
    }

    // 3) 重算两个列表页（全量 detail 重算后统一刷新指纹）
    const affectedNews = await this.sync.syncAfterArticleChange(siteId, newsPageIds)
    const categories = [...new Set(faqs.map((row) => row.category))]
    const affectedFaq = await this.sync.syncAfterFaqChange(siteId, faqPageIds, categories)
    const affectedPages = [...new Set([...newsPageIds, ...faqPageIds, ...affectedNews, ...affectedFaq])]
    for (const pageId of affectedPages) await this.editor.refreshContentHash(pageId)

    // 4) 统一发布一次
    const publishTaskId = await this.publishAffected(user, siteId, affectedPages)
    return {
      articles: articles.length,
      faqs: faqs.length,
      affectedPages: affectedPages.length,
      publishTaskId
    }
  }

  // ---------------- 内部 ----------------

  /**
   * 受影响页面的页面级自动发布（系统入口：构建中允许排队）
   * 只发布其中已发布状态的页面；返回发布任务 id（无需发布时为 null）
   */
  private async publishAffected(user: AuthUser, siteId: string, pageIds: string[]): Promise<string | null> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true }
    })
    if (!site) return null
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
