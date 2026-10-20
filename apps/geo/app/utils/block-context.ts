/**
 * 块渲染上下文构造（09 §5「数据注入契约」）
 *
 * 块能直接拿到什么，必须有明确边界：
 *   site    —— 站点档案（NAP 只读引用，块不得改写）
 *   page    —— 当前页元信息
 *   channel —— 目录与祖先链（面包屑与「同级推荐」用）
 *   block   —— 块实例自身（仅 id/key/enabled）
 *   entities—— 站点实体清单
 *   items   —— 仅列表块（dataSource=childPages）注入的列表数据
 *   now/locale
 *
 * 不注入的东西同样是设计决定：块**拿不到数据库、拿不到其他站点的数据**，
 * 因此块代码再怎么写也无法越界取数（见 ADR-024 的安全边界说明）。
 */
import type { BlockContext } from '@trillion/shared'
import type { SiteConfig } from '../composables/useSite'
import type { PageDetail } from '../composables/usePage'

/** 北京时间日期串（YYYY-MM-DD），与全站时间口径一致 */
function beijingDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function buildBlockContext(input: {
  site: SiteConfig
  page: PageDetail
  /** 列表块的取数结果（按块 id 索引） */
  itemsByBlockId?: Record<string, unknown[]>
}): BlockContext {
  const { site, page } = input

  return {
    site: {
      id: site.id,
      name: site.name,
      commonName: site.commonName,
      legalName: site.legalName,
      abbrName: site.abbrName || [],
      slug: site.slug,
      domain: site.domain,
      icpNumber: site.icpNumber,
      policeNumber: site.policeNumber,
      creditCode: site.creditCode,
      clinicRegNo: site.clinicRegNo,
      phone: site.phone,
      addressFull: site.addressFull,
      postalCode: site.postalCode,
      lat: site.lat,
      lng: site.lng,
      openingHours: site.openingHours || [],
      medicalInsurance: site.medicalInsurance,
      insuranceNo: site.insuranceNo,
      logoUrl: site.logoUrl,
      faviconUrl: site.faviconUrl,
      seoTitle: site.seoTitle,
      seoDescription: site.seoDescription,
      seoKeywords: site.seoKeywords,
      themeTokens: (site.themeTokens || {}) as Record<string, string>,
      entityPath: site.entityPath
    },
    page: {
      id: page.id,
      title: page.title,
      path: page.path,
      kind: page.kind,
      summary: page.summary,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoKeywords: page.seoKeywords,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      authorName: page.authorName
    },
    channel: page.channel,
    /** 块级上下文在 BlockRenderer 里按实例覆盖，这里给出页面级缺省 */
    block: { id: '', key: '', enabled: true },
    items: undefined,
    entities: (page.entities || []).map((entity) => ({
      name: entity.name,
      aliases: (entity.aliases as string[]) || [],
      type: entity.type,
      description: entity.description
    })),
    now: beijingDate(),
    locale: 'zh-CN'
  }
}
