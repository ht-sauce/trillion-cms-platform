/**
 * 成功案例管理服务（表驱动）
 *
 * 管理源是 CaseStudy 表；/cases 列表页的 case-grid 与 /cases/{slug} 详情页是发布产物。
 * 保存即发布：写表 → 按模板派生详情页 → 重算 /cases 列表卡片 → 触发页面级发布。
 *
 * 约定：
 * - 每条案例保存都会确保详情页存在（用户口径：案例数据一律有详情页；无正文时页面为
 *   「头部 + 项目信息 + telbar」组合，补内容后再保存即更新）
 * - slug 创建后不可修改（编辑 DTO 不收 slug）；缺省自动生成 case-YYYYMMDD-序号
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { PublishService } from '../publish/publish.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import { CatalogSyncService, CASE_SECTION, type CaseView } from './catalog-sync.service'
import type { CreateCaseDto, UpdateCaseDto } from './dto'

/** 页面摘要截断长度 */
const SUMMARY_MAX = 200

/** 截断（超长以省略号结尾） */
function truncate(text: string, max: number): string {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** 今天的中国时区日期（YYYYMMDD，自动 slug 用） */
function todayCompact(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '')
}

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService,
    private readonly sync: CatalogSyncService,
    private readonly publish: PublishService
  ) {}

  /** 案例分页列表（keyword 匹配标题；可按行业过滤） */
  async listCases(user: AuthUser, siteId: string, page: number, pageSize: number, keyword?: string, industry?: string) {
    assertSiteAccess(user, siteId)
    const where: Record<string, unknown> = { siteId }
    if (keyword) where.title = { contains: keyword }
    if (industry) where.industry = industry

    const [rows, total, industries] = await Promise.all([
      this.prisma.caseStudy.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.caseStudy.count({ where }),
      this.prisma.caseStudy.findMany({ where: { siteId }, select: { industry: true } })
    ])

    const list = rows.map((row) => ({
      id: row.id,
      pageId: row.pageId,
      path: joinPath(CASE_SECTION, row.slug),
      title: row.title,
      industry: row.industry,
      location: row.location,
      area: row.area,
      year: row.year,
      system: row.system,
      img: row.img,
      sort: row.sort,
      status: row.status
    }))
    const industryList = [...new Set(industries.map((row) => row.industry).filter(Boolean))]
    return { list, total, page, pageSize, industryList }
  }

  /** 单条案例详情（含正文与结构化字段，编辑回显用） */
  async getCase(user: AuthUser, id: string) {
    const row = await this.prisma.caseStudy.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('案例不存在')
    assertSiteAccess(user, row.siteId)
    return {
      id: row.id,
      pageId: row.pageId,
      path: joinPath(CASE_SECTION, row.slug),
      slug: row.slug,
      title: row.title,
      industry: row.industry,
      location: row.location,
      area: row.area,
      year: row.year,
      system: row.system,
      img: row.img,
      lead: row.lead,
      chips: (row.chips as string[] | null) ?? [],
      bgImage: row.bgImage,
      infoRows: (row.infoRows as Record<string, unknown>[] | null) ?? [],
      body: row.body,
      images: (row.images as Record<string, unknown>[] | null) ?? [],
      sort: row.sort,
      status: row.status
    }
  }

  /** 新建案例：写表 → 派生详情页 → 重算列表 → 自动发布 */
  async createCase(user: AuthUser, dto: CreateCaseDto) {
    assertSiteAccess(user, dto.siteId)
    const slug = dto.slug?.trim() || (await this.autoSlug(dto.siteId))
    const taken = await this.prisma.caseStudy.findUnique({
      where: { siteId_slug: { siteId: dto.siteId, slug } },
      select: { id: true }
    })
    if (taken) throw new BadRequestException(`已存在相同 slug 的案例：${slug}`)

    const channel = await this.resolveChannel(dto.siteId)
    await this.assertPathFree(dto.siteId, joinPath(channel.path, slug))

    const max = await this.prisma.caseStudy.aggregate({ where: { siteId: dto.siteId }, _max: { sort: true } })
    const row = await this.prisma.caseStudy.create({
      data: {
        siteId: dto.siteId,
        title: dto.title,
        industry: dto.industry ?? '',
        location: dto.location ?? '',
        area: dto.area ?? '',
        year: dto.year ?? '',
        system: dto.system ?? '',
        img: dto.img ?? '',
        lead: dto.lead ?? '',
        chips: toJsonInput(dto.chips ?? []),
        bgImage: dto.bgImage ?? '',
        infoRows: toJsonInput(dto.infoRows ?? []),
        body: dto.body ?? '',
        images: toJsonInput(dto.images ?? []),
        slug,
        status: 'published',
        sort: dto.sort ?? (max._max.sort ?? 0) + 1
      }
    })

    const pageId = await this.deriveDetailPage(row.id)
    const affectedPages = await this.syncAndPublish(user, dto.siteId, pageId ? [pageId] : [])
    return { id: row.id, pageId, path: joinPath(CASE_SECTION, slug), affectedPages }
  }

  /** 编辑案例：更新表 → 重建详情页（缺失补建）→ 重算列表 → 自动发布 */
  async updateCase(user: AuthUser, id: string, dto: UpdateCaseDto) {
    const row = await this.prisma.caseStudy.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('案例不存在')
    assertSiteAccess(user, row.siteId)

    await this.prisma.caseStudy.update({
      where: { id: row.id },
      data: {
        title: dto.title ?? row.title,
        industry: dto.industry ?? row.industry,
        location: dto.location ?? row.location,
        area: dto.area ?? row.area,
        year: dto.year ?? row.year,
        system: dto.system ?? row.system,
        img: dto.img ?? row.img,
        lead: dto.lead ?? row.lead,
        chips: dto.chips === undefined ? toJsonInput((row.chips as string[] | null) ?? []) : toJsonInput(dto.chips),
        bgImage: dto.bgImage ?? row.bgImage,
        infoRows: dto.infoRows === undefined ? toJsonInput(row.infoRows ?? []) : toJsonInput(dto.infoRows),
        body: dto.body ?? row.body,
        images: dto.images === undefined ? toJsonInput(row.images ?? []) : toJsonInput(dto.images),
        sort: dto.sort ?? row.sort,
        status: dto.status ?? row.status
      }
    })

    const pageId = await this.deriveDetailPage(row.id)
    const affectedPages = await this.syncAndPublish(user, row.siteId, pageId ? [pageId] : [])
    return { id: row.id, pageId, affectedPages }
  }

  /** 删除案例：删发布产物页面 → 删表记录 → 重算列表 → 自动发布 */
  async removeCase(user: AuthUser, id: string) {
    const row = await this.prisma.caseStudy.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('案例不存在')
    assertSiteAccess(user, row.siteId)

    const pageId = await this.findLinkedPage(row.pageId, row.siteId)
    if (pageId) await this.prisma.page.delete({ where: { id: pageId } })
    await this.prisma.caseStudy.delete({ where: { id: row.id } })

    const affectedPages = await this.syncAndPublish(user, row.siteId)
    return { id: row.id, pageId, affectedPages }
  }

  // ---------------- 内部 ----------------

  /** 按表数据派生/更新案例详情页，返回页面 id（缺失时创建） */
  private async deriveDetailPage(caseId: string): Promise<string | null> {
    const row = await this.prisma.caseStudy.findUnique({ where: { id: caseId } })
    if (!row) return null
    const channel = await this.resolveChannel(row.siteId)
    const template = await this.sync.loadDetailTemplate(row.siteId, CASE_SECTION)

    const existing = await this.findLinkedPage(row.pageId, row.siteId)
    const current = existing ? await this.prisma.page.findUnique({ where: { id: existing } }) : null
    const blocks = this.sync.buildCaseBlocks(this.toView(row), template, current?.blocks)
    /** 摘要只在页面尚未手写过时才补齐（同产品：页面 summary 是 meta description，派生不得代写） */
    const summary = current?.summary?.trim() || truncate(row.lead || row.body || row.title, SUMMARY_MAX)

    if (existing) {
      await this.prisma.page.update({
        where: { id: existing },
        data: { title: row.title, summary, blocks: toJsonInput(blocks) }
      })
      await this.editor.refreshContentHash(existing)
      return existing
    }

    const created = await this.prisma.page.create({
      data: {
        siteId: row.siteId,
        channelId: channel.id,
        templateId: 'default',
        title: row.title,
        slug: row.slug,
        path: joinPath(channel.path, row.slug),
        kind: 'detail',
        status: 'published',
        publishedAt: new Date(),
        summary,
        blocks: toJsonInput(blocks),
        sort: await this.nextPageSort(row.siteId, channel.id)
      }
    })
    await this.prisma.caseStudy.update({ where: { id: row.id }, data: { pageId: created.id } })
    await this.editor.refreshContentHash(created.id)
    return created.id
  }

  /** 表记录 → 派生视图 */
  private toView(row: {
    title: string
    industry: string
    location: string
    area: string
    year: string
    system: string
    img: string
    lead: string
    chips: unknown
    bgImage: string
    infoRows: unknown
    body: string
    images: unknown
  }): CaseView {
    return {
      title: row.title,
      industry: row.industry,
      location: row.location,
      area: row.area,
      year: row.year,
      system: row.system,
      img: row.img,
      lead: row.lead,
      chips: (row.chips as string[] | null) ?? [],
      bgImage: row.bgImage,
      infoRows: (row.infoRows as Record<string, unknown>[] | null) ?? [],
      body: row.body,
      images: (row.images as Record<string, unknown>[] | null) ?? []
    }
  }

  /** 案例列表页重算 + 受影响页面发布 */
  private async syncAndPublish(user: AuthUser, siteId: string, ownPageIds: string[] = []) {
    const listPageId = await this.sync.syncCasesList(siteId)
    const affected = [...new Set([...ownPageIds, ...(listPageId ? [listPageId] : [])])]
    if (affected.length) {
      const targets = await this.prisma.page.findMany({
        where: { id: { in: affected }, siteId, status: 'published' },
        select: { id: true }
      })
      if (targets.length) {
        await this.publish.enqueue(
          user,
          siteId,
          'page',
          { pageIds: targets.map((item) => item.id) },
          { allowQueueWhenBusy: true }
        )
      }
    }
    return affected
  }

  /** 案例所属目录：/cases 列表页是其 channel 的 index 落地页 */
  private async resolveChannel(siteId: string) {
    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: CASE_SECTION },
      select: { channelId: true }
    })
    if (listPage) {
      const channel = await this.prisma.channel.findUnique({ where: { id: listPage.channelId } })
      if (channel) return channel
    }
    throw new BadRequestException(`未找到「成功案例」（${CASE_SECTION}）栏目，无法创建案例详情页`)
  }

  /** 自动 slug：case-YYYYMMDD-序号（表内从 1 递增直到可用） */
  private async autoSlug(siteId: string): Promise<string> {
    const datePart = todayCompact()
    for (let index = 1; ; index += 1) {
      const candidate = `case-${datePart}-${index}`
      const exists = await this.prisma.caseStudy.findFirst({ where: { siteId, slug: candidate }, select: { id: true } })
      if (!exists) return candidate
    }
  }

  /** 访问地址占用校验 */
  private async assertPathFree(siteId: string, path: string) {
    const exists = await this.prisma.page.findFirst({ where: { siteId, path }, select: { id: true } })
    if (exists) throw new BadRequestException(`已存在相同访问地址的页面：${path}`)
  }

  /** 表记录的关联页面（归属/栏目校验，失联视为缺失） */
  private async findLinkedPage(pageId: string | null, siteId: string): Promise<string | null> {
    if (pageId == null) return null
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page || page.siteId !== siteId || !page.path?.startsWith(`${CASE_SECTION}/`)) return null
    return page.id
  }

  /** 目录内下一个排序值 */
  private async nextPageSort(siteId: string, channelId: string): Promise<number> {
    const max = await this.prisma.page.aggregate({ where: { siteId, channelId }, _max: { sort: true } })
    return (max._max.sort ?? 0) + 1
  }
}
