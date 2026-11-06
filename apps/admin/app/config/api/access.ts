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
  list(query: AccessEventQuery) {
    return get<Paged<AccessEventItem>>('/access-events', query)
  }
}
