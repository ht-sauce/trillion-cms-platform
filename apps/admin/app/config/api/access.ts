/**
 * 入站访问明细接口
 */
import { get, type Paged } from './http'

export type AccessResourceType = 'page' | 'asset' | 'llms' | 'sitemap' | 'robots' | 'payload' | 'other'
export type AccessCategory = 'browser' | 'search_bot' | 'ai_bot' | 'unknown'
export type AccessCompletion = 'finished' | 'aborted'

export interface AccessEventItem {
  id: string
  siteId: string | null
  host: string
  path: string
  method: string
  requestUrl: string
  clientIp: string
  peerIp: string
  userAgent: string
  referer: string | null
  browserName: string
  browserVersion: string | null
  resourceType: AccessResourceType
  accessCategory: AccessCategory
  agentToken: string | null
  vendor: string
  status: number | null
  durationMs: number
  completion: AccessCompletion
  country: string | null
  region: string | null
  city: string | null
  geoSource: string | null
  geoDbVersion: string | null
  geoStatus: string
  occurredAt: string
}

export interface AccessEventQuery {
  siteId?: string
  from?: string
  to?: string
  clientIp?: string
  path?: string
  resourceType?: AccessResourceType
  accessCategory?: AccessCategory
  agentToken?: string
  status?: number
  page?: number
  pageSize?: number
}

export type AccessSummaryQuery = Omit<AccessEventQuery, 'page' | 'pageSize'>

export interface AccessStatuses {
  success: number
  notModified: number
  redirect: number
  clientError: number
  serverError: number
  unknown: number
  aborted: number
}

export interface AccessSummary {
  range: { from: string; to: string; timezone: 'Asia/Shanghai' }
  granularity: 'hour' | 'day'
  totals: { requests: number; pageRequests: number; aiBotRequests: number; abnormalRequests: number }
  categories: { category: AccessCategory; requests: number; ratio: number | null }[]
  trend: ({ bucket: string } & Record<AccessCategory, number>)[]
  statuses: AccessStatuses
  crawlers: {
    category: 'search_bot' | 'ai_bot'
    agentToken: string | null
    vendor: string | null
    requests: number
    success: number
    notModified: number
    abnormalRequests: number
    lastRequestedAt: string
  }[]
  pages: { host: string; path: string; requests: number; aiBotRequests: number; abnormalRequests: number }[]
  resources: { resourceType: 'llms' | 'sitemap' | 'robots'; requests: number; statuses: AccessStatuses }[]
  referrers: { domain: string; requests: number }[]
  referrerSummary: { external: number; internal: number; missing: number; invalid: number }
  locations: {
    country: string | null
    region: string | null
    city: string | null
    geoStatus: string | null
    geoSource: string | null
    requests: number
  }[]
  locationAttribution: { name: string; url: string }
}

export const ACCESS_STATUS_OPTIONS: { label: string; value: keyof AccessStatuses }[] = [
  { label: '2xx', value: 'success' },
  { label: '304', value: 'notModified' },
  { label: '其他 3xx', value: 'redirect' },
  { label: '4xx', value: 'clientError' },
  { label: '5xx', value: 'serverError' },
  { label: '未知状态', value: 'unknown' },
  { label: '中断（独立维度）', value: 'aborted' }
]

export const ACCESS_RESOURCE_OPTIONS: { label: string; value: AccessResourceType }[] = [
  { label: '页面', value: 'page' },
  { label: '静态资源', value: 'asset' },
  { label: 'llms.txt', value: 'llms' },
  { label: 'sitemap', value: 'sitemap' },
  { label: 'robots.txt', value: 'robots' },
  { label: '数据载荷', value: 'payload' },
  { label: '其他', value: 'other' }
]

export const ACCESS_CATEGORY_OPTIONS: { label: string; value: AccessCategory }[] = [
  { label: '浏览器', value: 'browser' },
  { label: '搜索爬虫', value: 'search_bot' },
  { label: 'AI 爬虫', value: 'ai_bot' },
  { label: '未知', value: 'unknown' }
]

export const ACCESS_COMPLETION_LABEL: Record<AccessCompletion, string> = {
  finished: '已完成',
  aborted: '已中断'
}

export const accessApi = {
  summary(query: AccessSummaryQuery) {
    const { siteId, from, to, clientIp, path, resourceType, accessCategory, agentToken, status } = query
    return get<AccessSummary>('/access-events/summary', {
      siteId,
      from,
      to,
      clientIp,
      path,
      resourceType,
      accessCategory,
      agentToken,
      status
    })
  },
  list(query: AccessEventQuery) {
    return get<Paged<AccessEventItem>>('/access-events', query)
  }
}
