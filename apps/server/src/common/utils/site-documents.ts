/**
 * 站点级 GEO 产物文本生成（robots.txt / sitemap.xml / llms.txt）
 *
 * 为什么放在服务端而不是构建脚本里（09 §8.4）：
 *   「GEO 索引更新」接口要求在不重渲染页面的前提下重生成这三个文件 + 清单，
 *   若生成逻辑只存在于 apps/geo/scripts/build-sites.mjs，服务端就必须复制一份，
 *   两份实现迟早漂移。因此把生成口径统一收在本文件，
 *   构建脚本改为通过 `GET /public/documents/:key` 拉取结果后落盘。
 *
 * 纯函数、无 IO：输入站点档案 + 全量已发布路由，输出文本。
 */
import type { OpeningHourRule } from '@trillion/shared'
import type { RobotsPolicy } from '../../config/ai-crawlers'
import { buildRobotsTxt } from '../../config/ai-crawlers'

/** 站点文档生成所需的站点字段（只取用到的，避免耦合整表） */
export interface SiteDocumentSite {
  name: string
  slug: string
  domain: string
  commonName?: string | null
  legalName?: string | null
  creditCode?: string | null
  icpNumber?: string | null
  policeNumber?: string | null
  phone?: string | null
  addressFull?: string | null
  openingHours?: OpeningHourRule[]
  seoDescription?: string | null
  seoTitle?: string | null
  /** robots 放行策略 */
  robotsPolicy?: unknown
}

/** 站点文档生成所需的页面条目 */
export interface SiteDocumentRoute {
  id: string
  path: string
  title: string
  summary?: string | null
  kind?: string | null
  updatedAt?: Date | string | null
  publishedAt?: Date | string | null
}

/** 站点实体（品牌 / 产品）条目 */
export interface SiteDocumentEntity {
  name: string
  description?: string | null
}

/** 站点绝对地址（统一 https，主域名唯一） */
export function absoluteUrl(domain: string, path: string): string {
  const cleanDomain = String(domain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const cleanPath = path === '/' ? '/' : `/${String(path || '').replace(/^\/+|\/+$/g, '')}`
  return `https://${cleanDomain}${cleanPath}`
}

/** 取日期串（YYYY-MM-DD）；无值时用兜底日期 */
function dateOf(value: Date | string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const text = value instanceof Date ? value.toISOString() : String(value)
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  return match ? match[1] : fallback
}

/** robots.txt（默认放行 AI 爬虫，站点级策略可覆盖） */
export function buildSiteRobots(site: SiteDocumentSite): string {
  const raw = (site.robotsPolicy ?? {}) as Partial<RobotsPolicy>
  return buildRobotsTxt({
    allowAllAi: raw.allowAllAi ?? true,
    blockedAgents: Array.isArray(raw.blockedAgents) ? raw.blockedAgents : [],
    extraAllowedAgents: Array.isArray(raw.extraAllowedAgents) ? raw.extraAllowedAgents : []
  })
}

/** sitemap.xml：全量已发布路由 */
export function buildSiteSitemap(site: SiteDocumentSite, routes: SiteDocumentRoute[], now: string): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ]
  for (const route of routes) {
    lines.push(
      `  <url><loc>${absoluteUrl(site.domain, route.path)}</loc>` +
        `<lastmod>${dateOf(route.updatedAt || route.publishedAt, now)}</lastmod></url>`
    )
  }
  lines.push('</urlset>')
  return lines.join('\n')
}

/** 门诊时间摘要（给 llms.txt 用，NAP 口径唯一） */
function openingSummary(hours: OpeningHourRule[] | undefined): string {
  if (!Array.isArray(hours) || !hours.length) return ''
  return hours
    .map((rule) => {
      const season = rule.season ? `${rule.season}` : ''
      const time = `${rule.open}-${rule.close}`
      return `${season}${rule.weekday} ${time}${rule.note ? `（${rule.note}）` : ''}`
    })
    .filter(Boolean)
    .join('；')
}

/**
 * llms.txt：面向大模型的可读站点摘要
 * 输出「是什么 / 权威信息（NAP）/ 关键页面 / 实体」四段，事实优先、不写营销语。
 */
export function buildSiteLlms(
  site: SiteDocumentSite,
  routes: SiteDocumentRoute[],
  entities: SiteDocumentEntity[]
): string {
  const name = site.commonName || site.name
  const opening = openingSummary(site.openingHours)

  const sections: string[][] = []

  sections.push([`# ${name}`, '', `> ${site.seoDescription || site.seoTitle || name}`])

  const facts: string[] = []
  if (site.legalName && site.legalName !== name) facts.push(`机构全称：${site.legalName}`)
  if (site.creditCode) facts.push(`统一社会信用代码：${site.creditCode}`)
  if (site.addressFull) facts.push(`地址：${site.addressFull}`)
  if (site.phone) facts.push(`电话：${site.phone}`)
  if (opening) facts.push(`门诊时间：${opening}`)
  if (site.icpNumber) facts.push(`ICP 备案号：${site.icpNumber}`)
  if (site.policeNumber) facts.push(`公安备案号：${site.policeNumber}`)
  if (facts.length) sections.push(['## 权威信息', '', ...facts.map((item) => `- ${item}`)])

  if (routes.length) {
    sections.push([
      '## 关键页面',
      '',
      ...routes.map((route) => {
        const desc = route.summary ? `：${String(route.summary).replace(/\s+/g, ' ').slice(0, 120)}` : ''
        return `- [${route.title || route.path}](${absoluteUrl(site.domain, route.path)})${desc}`
      })
    ])
  }

  /**
   * 实体段：机构型站点（医院 / 诊所）通常没有单独维护品牌或产品实体，
   * 但「本站代表哪个主体」正是大模型最需要的一句声明 —— 没有品牌/产品实体时，
   * 用机构自身兜底写这一段，而不是整段省略（09 §12.4 要求 llms.txt 必含实体声明段）。
   */
  const entityLines: string[] = entities.length
    ? entities.map((entity) => `- ${entity.name}${entity.description ? `：${entity.description}` : ''}`)
    : [`- ${site.legalName || name}${site.seoDescription ? `：${site.seoDescription}` : ''}`]
  sections.push(['## 实体', '', ...entityLines])

  return sections.map((lines) => lines.join('\n')).join('\n\n')
}
