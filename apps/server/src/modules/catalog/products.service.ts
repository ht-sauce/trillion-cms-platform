/**
 * 产品体系管理服务（行业分组 + 产品，表驱动）
 *
 * 管理源是 ProductIndustry / Product 表；/products 列表页与 /products/{slug} 详情页是发布产物。
 * 保存即发布：写表 → 按模板派生详情页 → 重算 /products 行业分组 → 触发页面级发布。
 *
 * 约定：
 * - 每条产品保存都会确保详情页存在（用户口径：产品数据一律有详情页；无详情字段时页面为
 *   「头部 + telbar」的最小组合，补内容后再保存即更新）
 * - slug 创建后不可修改（编辑 DTO 不收 slug），访问地址 /products/{slug}
 * - 行业分组删除前校验：仍有产品引用该分组时拒绝删除（避免产品丢失分类）
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { PublishService } from '../publish/publish.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import { CatalogSyncService, PRODUCT_SECTION, type ProductView } from './catalog-sync.service'
import type { CreateIndustryDto, CreateProductDto, UpdateIndustryDto, UpdateProductDto } from './dto'

/** 页面摘要截断长度 */
const SUMMARY_MAX = 200

/** 名称 → URL 片段（产品名均为 ASCII；非 ASCII 名称由调用方显式传 slug） */
function slugify(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

/** 截断（超长以省略号结尾） */
function truncate(text: string, max: number): string {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService,
    private readonly sync: CatalogSyncService,
    private readonly publish: PublishService
  ) {}

  // ---------------- 行业分组 ----------------

  /** 行业分组清单（含组内产品数，供后台展示与管理） */
  async listIndustries(user: AuthUser, siteId: string) {
    assertSiteAccess(user, siteId)
    const [industries, products] = await Promise.all([
      this.prisma.productIndustry.findMany({
        where: { siteId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }]
      }),
      this.prisma.product.findMany({ where: { siteId }, select: { industries: true } })
    ])
    const list = industries.map((industry) => ({
      id: industry.id,
      name: industry.name,
      desc: industry.desc,
      moreLabel: industry.moreLabel,
      sort: industry.sort,
      productCount: products.filter((product) => ((product.industries as string[] | null) ?? []).includes(industry.name))
        .length
    }))
    return { list }
  }

  /** 新建行业分组 */
  async createIndustry(user: AuthUser, dto: CreateIndustryDto) {
    assertSiteAccess(user, dto.siteId)
    const exists = await this.prisma.productIndustry.findUnique({
      where: { siteId_name: { siteId: dto.siteId, name: dto.name } },
      select: { id: true }
    })
    if (exists) throw new BadRequestException(`已存在同名行业分组：${dto.name}`)

    const max = await this.prisma.productIndustry.aggregate({ where: { siteId: dto.siteId }, _max: { sort: true } })
    const row = await this.prisma.productIndustry.create({
      data: {
        siteId: dto.siteId,
        name: dto.name,
        desc: dto.desc ?? '',
        moreLabel: dto.moreLabel ?? null,
        sort: dto.sort ?? (max._max.sort ?? 0) + 1
      }
    })
    const affectedPages = await this.syncAndPublish(user, dto.siteId)
    return { id: row.id, affectedPages }
  }

  /** 编辑行业分组（改分组名时同步产品内的行业引用） */
  async updateIndustry(user: AuthUser, id: string, dto: UpdateIndustryDto) {
    const row = await this.prisma.productIndustry.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('行业分组不存在')
    assertSiteAccess(user, row.siteId)

    const name = dto.name ?? row.name
    if (name !== row.name) {
      const taken = await this.prisma.productIndustry.findUnique({
        where: { siteId_name: { siteId: row.siteId, name } },
        select: { id: true }
      })
      if (taken) throw new BadRequestException(`已存在同名行业分组：${name}`)
      /** 产品上的行业引用是名称数组，改名必须同步，否则分组会变空 */
      const products = await this.prisma.product.findMany({ where: { siteId: row.siteId }, select: { id: true, industries: true } })
      for (const product of products) {
        const industries = (product.industries as string[] | null) ?? []
        if (!industries.includes(row.name)) continue
        const next = industries.map((item) => (item === row.name ? name : item))
        await this.prisma.product.update({ where: { id: product.id }, data: { industries: toJsonInput(next) } })
      }
    }

    await this.prisma.productIndustry.update({
      where: { id: row.id },
      data: {
        name,
        desc: dto.desc ?? row.desc,
        moreLabel: dto.moreLabel === undefined ? row.moreLabel : dto.moreLabel || null,
        sort: dto.sort ?? row.sort
      }
    })
    const affectedPages = await this.syncAndPublish(user, row.siteId)
    return { id: row.id, affectedPages }
  }

  /** 删除行业分组（仍有产品引用时拒绝） */
  async removeIndustry(user: AuthUser, id: string) {
    const row = await this.prisma.productIndustry.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('行业分组不存在')
    assertSiteAccess(user, row.siteId)

    const products = await this.prisma.product.findMany({ where: { siteId: row.siteId }, select: { name: true, industries: true } })
    const used = products.filter((product) => ((product.industries as string[] | null) ?? []).includes(row.name))
    if (used.length) {
      throw new BadRequestException(`分组内还有 ${used.length} 个产品（${used.slice(0, 3).map((p) => p.name).join('、')}），请先调整产品分类`)
    }

    await this.prisma.productIndustry.delete({ where: { id: row.id } })
    const affectedPages = await this.syncAndPublish(user, row.siteId)
    return { id: row.id, affectedPages }
  }

  // ---------------- 产品 ----------------

  /** 产品分页列表（keyword 匹配名称/中文名；可按系列、行业过滤） */
  async listProducts(
    user: AuthUser,
    siteId: string,
    page: number,
    pageSize: number,
    keyword?: string,
    series?: string,
    industry?: string
  ) {
    assertSiteAccess(user, siteId)
    const where: Record<string, unknown> = { siteId }
    if (keyword) where.OR = [{ name: { contains: keyword } }, { cnName: { contains: keyword } }]
    if (series) where.series = series
    /** 行业是多值 JSON 数组，用字符串包含匹配（分组名不含引号，等价于数组元素匹配） */
    if (industry) where.industries = { string_contains: `"${industry}"` }

    const [rows, total, seriesRows] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where: { siteId }, select: { series: true } })
    ])

    const list = rows.map((row) => ({
      id: row.id,
      pageId: row.pageId,
      path: joinPath(PRODUCT_SECTION, row.slug),
      name: row.name,
      cnName: row.cnName,
      series: row.series,
      industries: (row.industries as string[] | null) ?? [],
      tags: (row.tags as string[] | null) ?? [],
      img: row.img,
      desc: row.desc,
      sort: row.sort,
      status: row.status
    }))
    const seriesList = [...new Set(seriesRows.map((row) => row.series).filter(Boolean))]
    return { list, total, page, pageSize, seriesList }
  }

  /** 单条产品详情（含结构化详情字段，编辑回显用） */
  async getProduct(user: AuthUser, id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('产品不存在')
    assertSiteAccess(user, row.siteId)
    return {
      id: row.id,
      pageId: row.pageId,
      path: joinPath(PRODUCT_SECTION, row.slug),
      slug: row.slug,
      name: row.name,
      cnName: row.cnName,
      series: row.series,
      industries: (row.industries as string[] | null) ?? [],
      tags: (row.tags as string[] | null) ?? [],
      desc: row.desc,
      img: row.img,
      lead: row.lead,
      chips: (row.chips as string[] | null) ?? [],
      bgImage: row.bgImage,
      systemIntro: (row.systemIntro as { k: string; v: string }[] | null) ?? [],
      layers: (row.layers as Record<string, unknown>[] | null) ?? [],
      features: (row.features as Record<string, unknown>[] | null) ?? [],
      colors: (row.colors as Record<string, unknown>[] | null) ?? [],
      faqs: (row.faqs as { q: string; a: string }[] | null) ?? [],
      sort: row.sort,
      status: row.status
    }
  }

  /** 新建产品：写表 → 派生详情页 → 重算列表页 → 自动发布 */
  async createProduct(user: AuthUser, dto: CreateProductDto) {
    assertSiteAccess(user, dto.siteId)
    const slug = (dto.slug?.trim() || slugify(dto.name)).trim()
    if (!slug) throw new BadRequestException('无法从名称生成 URL 片段，请手动填写 slug')
    const taken = await this.prisma.product.findUnique({
      where: { siteId_slug: { siteId: dto.siteId, slug } },
      select: { id: true }
    })
    if (taken) throw new BadRequestException(`已存在相同 slug 的产品：${slug}`)

    const channel = await this.resolveChannel(dto.siteId)
    await this.assertPathFree(dto.siteId, joinPath(channel.path, slug))

    const max = await this.prisma.product.aggregate({ where: { siteId: dto.siteId }, _max: { sort: true } })
    const row = await this.prisma.product.create({
      data: {
        siteId: dto.siteId,
        name: dto.name,
        cnName: dto.cnName ?? '',
        series: dto.series ?? '',
        industries: toJsonInput(dto.industries ?? []),
        tags: toJsonInput(dto.tags ?? []),
        desc: dto.desc ?? '',
        img: dto.img ?? '',
        lead: dto.lead ?? '',
        chips: toJsonInput(dto.chips ?? []),
        bgImage: dto.bgImage ?? '',
        systemIntro: toJsonInput(dto.systemIntro ?? []),
        layers: toJsonInput(dto.layers ?? []),
        features: toJsonInput(dto.features ?? []),
        colors: toJsonInput(dto.colors ?? []),
        faqs: toJsonInput(dto.faqs ?? []),
        slug,
        status: 'published',
        sort: dto.sort ?? (max._max.sort ?? 0) + 1
      }
    })

    const pageId = await this.deriveDetailPage(row.id)
    const affectedPages = await this.syncAndPublish(user, dto.siteId, pageId ? [pageId] : [])
    return { id: row.id, pageId, path: joinPath(PRODUCT_SECTION, slug), affectedPages }
  }

  /** 编辑产品：更新表 → 重建详情页（缺失补建）→ 重算列表页 → 自动发布 */
  async updateProduct(user: AuthUser, id: string, dto: UpdateProductDto) {
    const row = await this.prisma.product.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('产品不存在')
    assertSiteAccess(user, row.siteId)

    await this.prisma.product.update({
      where: { id: row.id },
      data: {
        name: dto.name ?? row.name,
        cnName: dto.cnName ?? row.cnName,
        series: dto.series ?? row.series,
        industries: dto.industries === undefined ? toJsonInput((row.industries as string[] | null) ?? []) : toJsonInput(dto.industries),
        tags: dto.tags === undefined ? toJsonInput((row.tags as string[] | null) ?? []) : toJsonInput(dto.tags),
        desc: dto.desc ?? row.desc,
        img: dto.img ?? row.img,
        lead: dto.lead ?? row.lead,
        chips: dto.chips === undefined ? toJsonInput((row.chips as string[] | null) ?? []) : toJsonInput(dto.chips),
        bgImage: dto.bgImage ?? row.bgImage,
        systemIntro: dto.systemIntro === undefined ? toJsonInput(row.systemIntro ?? []) : toJsonInput(dto.systemIntro),
        layers: dto.layers === undefined ? toJsonInput(row.layers ?? []) : toJsonInput(dto.layers),
        features: dto.features === undefined ? toJsonInput(row.features ?? []) : toJsonInput(dto.features),
        colors: dto.colors === undefined ? toJsonInput(row.colors ?? []) : toJsonInput(dto.colors),
        faqs: dto.faqs === undefined ? toJsonInput(row.faqs ?? []) : toJsonInput(dto.faqs),
        sort: dto.sort ?? row.sort,
        status: dto.status ?? row.status
      }
    })

    const pageId = await this.deriveDetailPage(row.id)
    const affectedPages = await this.syncAndPublish(user, row.siteId, pageId ? [pageId] : [])
    return { id: row.id, pageId, affectedPages }
  }

  /** 删除产品：删发布产物页面 → 删表记录 → 重算列表页 → 自动发布 */
  async removeProduct(user: AuthUser, id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('产品不存在')
    assertSiteAccess(user, row.siteId)

    const pageId = await this.findLinkedPage(row.pageId, row.siteId)
    if (pageId) await this.prisma.page.delete({ where: { id: pageId } })
    await this.prisma.product.delete({ where: { id: row.id } })

    const affectedPages = await this.syncAndPublish(user, row.siteId)
    return { id: row.id, pageId, affectedPages }
  }

  /**
   * 批量重建派生页面（数据导入 / 修复用）：为全部产品补建或刷新详情页，
   * 重算 /products 列表页，最后统一发布一次——避免逐条导入触发 N 次构建。
   */
  async rebuild(user: AuthUser, siteId: string) {
    assertSiteAccess(user, siteId)
    const rows = await this.prisma.product.findMany({ where: { siteId }, orderBy: { sort: 'asc' } })
    const pageIds: string[] = []
    for (const row of rows) {
      const pageId = await this.deriveDetailPage(row.id)
      if (pageId) pageIds.push(pageId)
    }
    const affectedPages = await this.syncAndPublish(user, siteId, pageIds)
    return { products: rows.length, affectedPages, publishTaskId: null, affected: affectedPages }
  }

  // ---------------- 内部 ----------------

  /** 按表数据派生/更新产品详情页，返回页面 id（页面缺失时创建） */
  private async deriveDetailPage(productId: string): Promise<string | null> {
    const row = await this.prisma.product.findUnique({ where: { id: productId } })
    if (!row) return null
    const channel = await this.resolveChannel(row.siteId)
    const template = await this.sync.loadDetailTemplate(row.siteId, PRODUCT_SECTION)

    const existing = await this.findLinkedPage(row.pageId, row.siteId)
    const current = existing ? await this.prisma.page.findUnique({ where: { id: existing } }) : null
    const blocks = this.sync.buildProductBlocks(this.toView(row), template, current?.blocks)
    const title = `${row.name}${row.cnName ? ` ${row.cnName}` : ''}`.trim()
    /**
     * 摘要只在页面尚未手写过时才由表字段补齐。
     * 页面 `summary` 同时是 meta description（llms.txt 也用它），运营在站点编辑器里
     * 精调过的句子不能被派生逻辑用产品卡片说明静默覆盖——「删文案就是删」，派生不得代写。
     */
    const summary = current?.summary?.trim() || truncate(row.lead || row.desc, SUMMARY_MAX)

    if (existing) {
      await this.prisma.page.update({
        where: { id: existing },
        data: { title, summary, blocks: toJsonInput(blocks) }
      })
      await this.editor.refreshContentHash(existing)
      return existing
    }

    const created = await this.prisma.page.create({
      data: {
        siteId: row.siteId,
        channelId: channel.id,
        templateId: 'default',
        title,
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
    await this.prisma.product.update({ where: { id: row.id }, data: { pageId: created.id } })
    await this.editor.refreshContentHash(created.id)
    return created.id
  }

  /** 表记录 → 派生视图（JSON 字段空值归一为数组） */
  private toView(row: {
    name: string
    cnName: string
    series: string
    desc: string
    img: string
    lead: string
    chips: unknown
    bgImage: string
    tags: unknown
    systemIntro: unknown
    layers: unknown
    features: unknown
    colors: unknown
    faqs: unknown
  }): ProductView {
    return {
      name: row.name,
      cnName: row.cnName,
      series: row.series,
      desc: row.desc,
      img: row.img,
      lead: row.lead,
      chips: (row.chips as string[] | null) ?? [],
      bgImage: row.bgImage,
      tags: (row.tags as string[] | null) ?? [],
      systemIntro: (row.systemIntro as { k: string; v: string }[] | null) ?? [],
      layers: (row.layers as Record<string, unknown>[] | null) ?? [],
      features: (row.features as Record<string, unknown>[] | null) ?? [],
      colors: (row.colors as Record<string, unknown>[] | null) ?? [],
      faqs: (row.faqs as { q: string; a: string }[] | null) ?? []
    }
  }

  /** 产品列表页重算 + 受影响页面发布，返回受影响页面 id */
  private async syncAndPublish(user: AuthUser, siteId: string, ownPageIds: string[] = []) {
    const listPageId = await this.sync.syncProductsList(siteId)
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

  /** 产品所属目录：/products 列表页是该目录的 index 落地页，其 channelId 即详情页所属目录 */
  private async resolveChannel(siteId: string) {
    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: PRODUCT_SECTION },
      select: { channelId: true }
    })
    if (listPage) {
      const channel = await this.prisma.channel.findUnique({ where: { id: listPage.channelId } })
      if (channel) return channel
    }
    throw new BadRequestException(`未找到「产品体系」（${PRODUCT_SECTION}）栏目，无法创建产品详情页`)
  }

  /** 访问地址占用校验（Page 按 [siteId, path] 唯一） */
  private async assertPathFree(siteId: string, path: string) {
    const exists = await this.prisma.page.findFirst({ where: { siteId, path }, select: { id: true } })
    if (exists) throw new BadRequestException(`已存在相同访问地址的页面：${path}`)
  }

  /** 表记录的关联页面：pageId 有效且归属同站点且属产品栏目；失联视为缺失 */
  private async findLinkedPage(pageId: string | null, siteId: string): Promise<string | null> {
    if (pageId == null) return null
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page || page.siteId !== siteId || !page.path?.startsWith(`${PRODUCT_SECTION}/`)) return null
    return page.id
  }

  /** 目录内下一个排序值 */
  private async nextPageSort(siteId: string, channelId: string): Promise<number> {
    const max = await this.prisma.page.aggregate({ where: { siteId, channelId }, _max: { sort: true } })
    return (max._max.sort ?? 0) + 1
  }
}
