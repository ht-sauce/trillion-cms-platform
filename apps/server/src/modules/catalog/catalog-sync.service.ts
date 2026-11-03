/**
 * 产品 / 案例派生块同步服务（catalog 模块核心）
 *
 * 管理源是 ProductIndustry / Product / CaseStudy 独立数据表；Page 是发布产物：
 * kind=detail 的详情页（/products/*、/cases/*）加上承载派生数据的列表页（/products、/cases）。
 *
 * 详情页的**结构模板取自站点既有详情页**（同栏目下最早创建的 detail 页面）：
 * 块 key 序列、section-head 文案、telbar、article-body.disclaimer 等站点级口径一律沿用模板，
 * 本服务只按表数据替换「跟内容走」的字段（hero 标题/导语/标签、构造分层、特点、色卡、问答、正文、画面）。
 * 这样同一套代码对任何站点成立，不在代码里硬编码任何站点文案。
 *
 * 列表页重算：
 *   1) /products：行业分组 = ProductIndustry（sort 升序）× 组内 Product（sort 升序）
 *      → 每组「section-head（分组文案）+ product-card」；分组无产品时不输出；
 *      首组之前的块（hero 等）与末组之后的块（telbar 等）原样保留
 *   2) /cases：只更新 case-grid.items（hero / section-head / telbar 原样保留）
 *
 * 图表块实例 id 走 withStableIds：结构不变时内容指纹稳定。
 */
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import {
  assembleFromTemplate,
  blockData as dataOf,
  withStableIds,
  type BlockInstanceInput
} from '../../common/utils/block-instances'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'

/** 产品体系栏目路径 */
export const PRODUCT_SECTION = '/products'
/** 成功案例栏目路径 */
export const CASE_SECTION = '/cases'

/** 纯文本按换行拆段落（去空行、去首尾空白） */
export function splitParagraphs(content: string): string[] {
  return String(content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** 产品详情派生所需的表数据投影 */
export interface ProductView {
  name: string
  cnName: string
  series: string
  desc: string
  img: string
  lead: string
  chips: string[]
  bgImage: string
  tags: string[]
  systemIntro: { k: string; v: string }[]
  layers: Record<string, unknown>[]
  features: Record<string, unknown>[]
  colors: Record<string, unknown>[]
  faqs: { q: string; a: string }[]
}

/** 案例详情派生所需的表数据投影 */
export interface CaseView {
  title: string
  industry: string
  location: string
  area: string
  year: string
  system: string
  img: string
  lead: string
  chips: string[]
  bgImage: string
  infoRows: Record<string, unknown>[]
  body: string
  images: Record<string, unknown>[]
}

@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger('CatalogSync')

  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService
  ) {}

  // ---------------- 详情页模板与块组合 ----------------

  /** 站点内某栏目的详情页结构模板：取最早创建的 detail 页面（块骨架 + 固定文案的唯一来源） */
  async loadDetailTemplate(siteId: string, section: string): Promise<BlockInstanceInput[]> {
    const page = await this.prisma.page.findFirst({
      where: { siteId, kind: 'detail', path: { startsWith: `${section}/` } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { blocks: true }
    })
    return normalizeBlockInstances(page?.blocks)
  }

  /**
   * 产品详情页标准块组合（模板骨架 + 表数据）：
   * hero-dark（标题=名称/中文名，导语=lead 或 desc，标签=chips 或 tags）
   * → 系统说明（vcard-grid）→ 系统构造（layer-stack）→ 系统特点（feature-cards）
   * → 标准色卡（color-palette）→ 常见问题（faq-list）→ telbar
   * 表里没有的段落整组不输出（含其 section-head），不生成空章节。
   */
  buildProductBlocks(product: ProductView, template: BlockInstanceInput[], oldBlocks?: unknown): BlockInstanceInput[] {
    const current = normalizeBlockInstances(oldBlocks)
    const heroBase = (Object.keys(dataOf(current, 'hero-dark')).length ? dataOf(current, 'hero-dark') : dataOf(template, 'hero-dark')) as Record<string, unknown>
    const h1 = product.cnName ? `${product.name}\n${product.cnName}` : product.name
    const chips = product.chips?.length ? product.chips : product.tags ?? []
    const hero: Record<string, unknown> = {
      ...heroBase,
      h1,
      lead: product.lead || product.desc,
      chips,
      bgImage: product.bgImage || product.img || heroBase.bgImage,
      eyebrow: product.series ? `产品 · ${product.series}` : heroBase.eyebrow,
      orgline: product.cnName || heroBase.orgline
    }
    /** h1Grad 是 h1 内的高亮词，换产品后不再成立则去掉 */
    if (hero.h1Grad && !h1.includes(String(hero.h1Grad))) delete hero.h1Grad

    const overrides: Record<string, Record<string, unknown> | null> = {
      'hero-dark': hero,
      'vcard-grid': product.systemIntro?.length ? { items: product.systemIntro } : null,
      'layer-stack': product.layers?.length ? { layers: product.layers } : null,
      'feature-cards': product.features?.length
        ? { items: product.features, columns: String(Math.min(4, product.features.length)) }
        : null,
      'color-palette': product.colors?.length ? { swatches: product.colors } : null,
      'faq-list': product.faqs?.length ? { items: product.faqs } : null
    }
    return withStableIds(assembleFromTemplate(template, overrides), oldBlocks)
  }

  /**
   * 案例详情页标准块组合（模板骨架 + 表数据）：
   * hero-dark（标题/导语/标签）→ glass-card（项目信息行）→ article-body（正文）
   * → section-head + env-grid（项目画面）→ telbar
   */
  buildCaseBlocks(item: CaseView, template: BlockInstanceInput[], oldBlocks?: unknown): BlockInstanceInput[] {
    const current = normalizeBlockInstances(oldBlocks)
    const heroBase = (Object.keys(dataOf(current, 'hero-dark')).length ? dataOf(current, 'hero-dark') : dataOf(template, 'hero-dark')) as Record<string, unknown>
    const chips = item.chips?.length ? item.chips : [item.area, item.industry].filter(Boolean)
    const hero: Record<string, unknown> = {
      ...heroBase,
      h1: item.title,
      lead: item.lead || item.system,
      chips,
      bgImage: item.bgImage || item.img || heroBase.bgImage
    }
    if (hero.h1Grad && !item.title.includes(String(hero.h1Grad))) delete hero.h1Grad

    const card = dataOf(template, 'glass-card')
    const paragraphs = splitParagraphs(item.body)

    const overrides: Record<string, Record<string, unknown> | null> = {
      'hero-dark': hero,
      'glass-card': item.infoRows?.length ? { rows: item.infoRows, badge: item.industry || card.badge } : null,
      'article-body': paragraphs.length ? { blocks: paragraphs.map((text) => ({ kind: 'paragraph', text })) } : null,
      'env-grid': item.images?.length ? { items: item.images } : null
    }
    return withStableIds(assembleFromTemplate(template, overrides), oldBlocks)
  }

  // ---------------- 列表页重算 ----------------

  /**
   * 重算 /products 行业分组：
   * 首组之前的固定块（hero 等）+ 每组「section-head + product-card」+ 末组之后的固定块（telbar 等）
   */
  async syncProductsList(siteId: string): Promise<string | null> {
    const page = await this.prisma.page.findFirst({
      where: { siteId, path: PRODUCT_SECTION },
      select: { id: true, blocks: true }
    })
    if (!page) return null

    const [industries, products] = await Promise.all([
      this.prisma.productIndustry.findMany({ where: { siteId }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
      this.prisma.product.findMany({ where: { siteId, status: 'published' }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
    ])

    const instances = normalizeBlockInstances(page.blocks)

    /** 分组块定位：product-card 及其紧邻的 section-head（首个 product-card 之前的分组头也算） */
    const groupIndexes = new Set<number>()
    instances.forEach((inst, index) => {
      if (inst.key !== 'product-card') return
      groupIndexes.add(index)
      for (let back = index - 1; back >= 0; back -= 1) {
        if (instances[back].key === 'section-head') {
          groupIndexes.add(back)
          break
        }
        break
      }
    })
    const groupList = [...groupIndexes].sort((a, b) => a - b)
    const prefixEnd = groupList.length ? groupList[0] : instances.length
    const suffixStart = groupList.length ? groupList[groupList.length - 1] + 1 : instances.length

    const oldGroups = groupList.map((index) => instances[index])
    const groups = industries
      .map((industry) => {
        const items = products
          .filter((product) => ((product.industries as string[] | null) ?? []).includes(industry.name))
          .map((product) => {
            const card: Record<string, unknown> = {
              img: product.img,
              name: product.name,
              cnName: product.cnName,
              series: product.series,
              desc: product.desc,
              tags: (product.tags as string[] | null) ?? []
            }
            /** 有发布产物详情页才给卡片挂 href（无页面时不生成死链） */
            if (product.pageId) card.href = joinPath(PRODUCT_SECTION, product.slug)
            return card
          })
        if (!items.length) return null
        return {
          head: {
            title: industry.name,
            desc: industry.desc,
            ...(industry.moreLabel ? { moreLabel: industry.moreLabel } : {})
          },
          card: { items, columns: items.length >= 3 ? '3' : '2' }
        }
      })
      .filter((group): group is NonNullable<typeof group> => group !== null)

    const nextGroups = withStableIds(
      groups.flatMap((group) => [
        { key: 'section-head', data: group.head },
        { key: 'product-card', data: group.card }
      ]),
      oldGroups
    )

    const next = [...instances.slice(0, prefixEnd), ...nextGroups, ...instances.slice(suffixStart)]
    await this.prisma.page.update({ where: { id: page.id }, data: { blocks: toJsonInput(next) } })
    await this.refreshHash(page.id)
    return page.id
  }

  /** 重算 /cases 列表：只更新 case-grid.items（其余块原样保留） */
  async syncCasesList(siteId: string): Promise<string | null> {
    const page = await this.prisma.page.findFirst({
      where: { siteId, path: CASE_SECTION },
      select: { id: true, blocks: true }
    })
    if (!page) return null

    const rows = await this.prisma.caseStudy.findMany({
      where: { siteId, status: 'published' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    const items = rows.map((row) => {
      const card: Record<string, unknown> = {
        img: row.img,
        title: row.title,
        industry: row.industry,
        location: row.location,
        product: row.system
      }
      if (row.area) card.area = row.area
      if (row.year) card.year = row.year
      if (row.pageId) card.href = joinPath(CASE_SECTION, row.slug)
      return card
    })

    const next = normalizeBlockInstances(page.blocks).map((inst) =>
      inst.key === 'case-grid' ? { ...inst, data: { ...inst.data, items } } : inst
    )
    await this.prisma.page.update({ where: { id: page.id }, data: { blocks: toJsonInput(next) } })
    await this.refreshHash(page.id)
    return page.id
  }

  /** 内容指纹重算（块代码指纹口径与编辑器一致） */
  private async refreshHash(pageId: string) {
    try {
      await this.editor.refreshContentHash(pageId)
    } catch (error) {
      this.logger.warn(`内容指纹重算失败 pageId=${pageId}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
