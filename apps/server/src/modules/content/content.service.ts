/**
 * 内容服务：栏目树、页面 CRUD、三态流转、GEO 体检
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { siteIdWhere } from '../../common/utils/site-scope'
import { PAGE_DEFAULT, PAGE_SIZE_DEFAULT } from '../../common/constants'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import { checkPageGeo } from '../../common/utils/geo-check'
import { resolvePagePath } from '../../common/utils/site-path'
import type { CreateChannelDto, CreatePageDto, UpdatePageDto } from './dto'

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- 栏目 ----------------

  /** 栏目树（按站点，返回嵌套结构） */
  async channels(user: AuthUser, siteId: string) {
    const list = await this.prisma.channel.findMany({
      where: { siteId, ...siteIdWhere(user, siteId) },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    return buildTree(list)
  }

  /** 新建栏目 */
  async createChannel(dto: CreateChannelDto) {
    return this.prisma.channel.create({
      data: {
        siteId: dto.siteId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        slug: dto.slug,
        sort: dto.sort ?? 0,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription
      }
    })
  }

  // ---------------- 页面 ----------------

  /** 页面列表（可按站点/栏目/状态筛选） */
  async pages(user: AuthUser, siteId: string, channelId?: string, page = PAGE_DEFAULT, pageSize = PAGE_SIZE_DEFAULT) {
    const where: Record<string, unknown> = { siteId, ...siteIdWhere(user, siteId) }
    if (channelId) where.channelId = channelId

    const [list, total] = await Promise.all([
      this.prisma.page.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' }
      }),
      this.prisma.page.count({ where })
    ])

    /** NAP 一致性基准：列表里每页都要比对，站点档案只查一次 */
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { phone: true, contactPhone: true, addressFull: true, companyAddress: true, legalName: true }
    })

    return {
      list: list.map((item) => ({
        ...item,
        blocks: item.blocks as unknown[],
        geoScore: checkPageGeo(
          {
            id: item.id,
            title: item.title,
            path: item.path,
            kind: item.kind,
            summary: item.summary,
            seoTitle: item.seoTitle,
            seoDescription: item.seoDescription,
            blocks: normalizeBlockInstances(item.blocks),
            authorName: item.authorName,
            editorial: item.editorial
          },
          {
            sitePhone: site?.phone || site?.contactPhone || null,
            siteAddress: site?.addressFull || site?.companyAddress || null,
            siteLegalName: site?.legalName || null
          }
        ).score
      })),
      total,
      page,
      pageSize
    }
  }

  /** 页面详情 */
  async pageDetail(user: AuthUser, id: string) {
    const item = await this.prisma.page.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('页面不存在')
    siteIdWhere(user, item.siteId)
    return { ...item, blocks: item.blocks as unknown[] }
  }

  /** 新建页面 */
  async createPage(dto: CreatePageDto) {
    return this.prisma.page.create({
      data: {
        siteId: dto.siteId,
        channelId: dto.channelId,
        templateId: dto.templateId || 'default',
        title: dto.title,
        slug: dto.slug,
        status: dto.status || 'draft',
        summary: dto.summary,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        seoKeywords: dto.seoKeywords,
        blocks: (dto.blocks ?? []) as never,
        authorName: dto.authorName
      }
    })
  }

  /**
   * 编辑页面（含 Block 数据）
   *
   * ADR-025：已发布页面锁定 slug / channelId（URL 不可变），改名换目录只允许在草稿阶段。
   * 与 `editor.service.updatePageMeta` 同一口径，两条编辑入口都必须拦。
   */
  async updatePage(id: string, dto: UpdatePageDto) {
    const page = await this.prisma.page.findUnique({
      where: { id },
      select: { id: true, siteId: true, channelId: true, slug: true, status: true }
    })
    if (!page) throw new NotFoundException('页面不存在')

    const changingSlug = dto.slug !== undefined && dto.slug !== page.slug
    const changingChannel = dto.channelId !== undefined && dto.channelId !== page.channelId
    if (page.status === 'published' && (changingSlug || changingChannel)) {
      throw new BadRequestException('已发布页面的访问地址不可修改')
    }

    const data: Record<string, unknown> = { ...dto }
    delete data.siteId

    /** 地址变了就把 path 重新物化，避免 path 与 slug 漂移（与 editor.service 同一实现） */
    if (changingSlug || changingChannel) {
      const channelId = changingChannel ? dto.channelId! : page.channelId
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { path: true, slug: true, siteId: true }
      })
      if (!channel || channel.siteId !== page.siteId) throw new BadRequestException('所属目录不存在')
      if (changingChannel) data.channelId = channelId
      data.path = resolvePagePath(channel.path ?? `/${channel.slug}`, String(dto.slug ?? page.slug))
    }

    return this.prisma.page.update({ where: { id }, data: data as never })
  }

  /** 三态流转：draft → pending_review → published */
  async changeStatus(id: string, status: 'draft' | 'pending_review' | 'published') {
    const page = await this.prisma.page.findUnique({ where: { id } })
    if (!page) throw new NotFoundException('页面不存在')

    if (status === 'published') {
      const result = await this.runGeoCheck(page)
      if (!result.passed) {
        throw new BadRequestException(
          `未通过 GEO 校验：${result.issues
            .filter((i) => i.level === 'error')
            .map((i) => i.message)
            .join('；')}`
        )
      }
    }

    return this.prisma.page.update({
      where: { id },
      data: { status, publishedAt: status === 'published' ? (page.publishedAt ?? new Date()) : page.publishedAt }
    })
  }

  /** GEO 体检（管理后台编辑页面实时调用） */
  async geoCheck(id: string) {
    const page = await this.prisma.page.findUnique({ where: { id } })
    if (!page) throw new NotFoundException('页面不存在')
    return this.runGeoCheck(page)
  }

  /**
   * 执行页面 GEO 体检（09 §10.4）
   * 上下文需要站点 NAP 与「同站点重复路径」，因此在此统一补齐后再交给纯函数
   */
  private async runGeoCheck(page: {
    id: string
    siteId: string
    title: string
    path: string | null
    kind: string
    summary: string | null
    seoTitle: string | null
    seoDescription: string | null
    authorName: string | null
    blocks: unknown
    editorial?: unknown
    jsonLd?: string | null
  }) {
    const site = await this.prisma.site.findUnique({
      where: { id: page.siteId },
      select: { phone: true, contactPhone: true, addressFull: true, companyAddress: true, legalName: true }
    })

    /**
     * canonical 冲突：Page 有 (siteId, path) 唯一约束，理论上不会重复；
     * 但「路径为空」或历史脏数据会让约束失效（NULL 不参与唯一），所以这里显式再查一次
     */
    const duplicatePaths: string[] = []
    if (page.path) {
      const samePath = await this.prisma.page.findMany({
        where: { siteId: page.siteId, path: page.path },
        select: { id: true }
      })
      if (samePath.length > 1) duplicatePaths.push(page.path)
    } else {
      duplicatePaths.push('(路径为空，请先执行路径重算)')
    }

    return checkPageGeo(
      {
        id: page.id,
        title: page.title,
        path: page.path,
        kind: page.kind,
        summary: page.summary,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        blocks: normalizeBlockInstances(page.blocks),
        authorName: page.authorName,
        editorial: page.editorial,
        jsonLd: page.jsonLd
      },
      {
        duplicatePaths,
        sitePhone: site?.phone || site?.contactPhone || null,
        siteAddress: site?.addressFull || site?.companyAddress || null,
        siteLegalName: site?.legalName || null
      }
    )
  }

  /** 删除页面 */
  async removePage(id: string) {
    await this.prisma.page.delete({ where: { id } })
    return { id }
  }
}

/** 扁平列表转树（parentId 自关联） */
function buildTree<T extends { id: string; parentId: string | null }>(list: T[]) {
  const map = new Map<string, Record<string, unknown>>()
  list.forEach((item) => map.set(item.id, { ...item, children: [] as Record<string, unknown>[] }))
  const roots: Record<string, unknown>[] = []
  list.forEach((item) => {
    const node = map.get(item.id) as Record<string, unknown>
    const parent = item.parentId ? map.get(item.parentId) : null
    if (parent) (parent.children as Record<string, unknown>[]).push(node)
    else roots.push(node)
  })
  return roots
}
