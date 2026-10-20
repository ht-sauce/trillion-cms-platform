/**
 * 站点档案读取（全局共享，避免每个页面重复请求）
 *
 * 返回的是**服务端算好的终态**：实体 JSON-LD、head 扩展、robots meta 标签都已合成完毕，
 * 渲染引擎直接注入即可——不再在前端二次拼装，保证后台预览看到的与线上产物一致（09 §10.3）。
 */
import { useApiBase } from '../utils/api-base'
import { useSiteContext } from './useSiteKey'
import type { OpeningHourRule, RobotsMeta, SameAsEntry, SiteThemeTokens } from '@trillion/shared'

/** 导航项（服务端已解析页面路径并剔除失效项） */
export interface NavigationItem {
  id: string
  label: string
  pageId: string | null
  href: string | null
  pagePath: string | null
}

export interface NavigationGroup {
  key: string
  title: string
  items: NavigationItem[]
}

export interface SiteConfig {
  id: string
  name: string
  slug: string
  domain: string
  renderMode: string
  defaultLocale: string

  // ---- 标识 ----
  legalName: string
  commonName: string
  abbrName: string[]

  // ---- 资质 ----
  clinicRegNo: string | null
  licenseValidFrom: string | null
  licenseValidTo: string | null
  orgType: string | null
  level: string | null
  legalPerson: string | null
  principal: string | null
  foundDate: string | null
  practiceScopes: string[]

  // ---- NAP ----
  addressFull: string | null
  postalCode: string | null
  lat: string | null
  lng: string | null
  phone: string | null
  phoneServiceHours: string | null

  // ---- 门诊 / 医保 ----
  openingHours: OpeningHourRule[]
  medicalInsurance: boolean
  insuranceNo: string | null

  // ---- 关联标识 ----
  sameAs: SameAsEntry[]

  // ---- 其他 ----
  creditCode: string | null
  icpNumber: string | null
  policeNumber: string | null
  contactEmail: string | null
  companyName: string
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null

  /** 站点设计令牌 */
  themeTokens: Partial<SiteThemeTokens>
  /** robots meta 策略与已生成的标签 */
  robotsMeta: Partial<RobotsMeta>
  robotsMetaTags: string
  /** 机构实体 JSON-LD（仅实体档案页注入） */
  entityJsonLd: string
  /** head 扩展（已净化） */
  headExtra: string

  logoUrl: string | null
  faviconUrl: string | null
  /** 机构实体档案页路径 */
  entityPath: string
  /** 资质待补字段（缺失不编造，页面显式标注） */
  pendingFields: string[]

  navigations: NavigationGroup[]
  entities: { name: string; aliases: unknown; type: string; description: string | null }[]
  channels: { id: string; name: string; slug: string; path: string }[]
}

export function useSite() {
  const { context, resolve } = useSiteContext()
  const apiBase = useApiBase()

  const site = useState<SiteConfig | null>('geo-site', () => null)

  async function load() {
    if (site.value) return site.value
    /** 先解析站点上下文：本地（回环地址）靠 URL 站点前缀定位站点，见 useSiteKey */
    await resolve()
    const result = await $fetch<{ code: number; data: SiteConfig }>(`${apiBase}/public/site/${context.value.key}`)
    site.value = result.data
    return site.value
  }

  /** 按分组键取导航（header / footer-1 ~ footer-4） */
  function navigationOf(groupKey: string): NavigationGroup | null {
    return site.value?.navigations?.find((item) => item.key === groupKey) ?? null
  }

  return { site, context, load, navigationOf }
}
