/**
 * 内容接口：栏目与页面（含三态流转与 GEO 体检）
 */
import { get, post, patch, del, type Paged } from './http'

export type ContentStatus = 'draft' | 'pending_review' | 'published'

export interface ChannelItem {
  id: string
  siteId: string
  parentId: string | null
  name: string
  slug: string
  sort: number
  children?: ChannelItem[]
}

export interface PageItem {
  id: string
  siteId: string
  channelId: string
  templateId: string
  title: string
  slug: string
  status: ContentStatus
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  blocks: unknown[]
  authorName: string | null
  publishedAt: string | null
  geoScore?: number
}

export interface GeoCheckResult {
  score: number
  passed: boolean
  issues: { level: 'warn' | 'error'; field: string; message: string }[]
}

export const contentApi = {
  channels(siteId: string) {
    return get<ChannelItem[]>(`/content/channels`, { siteId })
  },
  createChannel(payload: Partial<ChannelItem>) {
    return post<ChannelItem>('/content/channels', payload)
  },
  pages(params: { siteId: string; channelId?: string; page?: number; pageSize?: number }) {
    return get<Paged<PageItem>>('/content/pages', params as Record<string, unknown>)
  },
  pageDetail(id: string) {
    return get<PageItem>(`/content/pages/${id}`)
  },
  createPage(payload: Partial<PageItem>) {
    return post<PageItem>('/content/pages', payload)
  },
  updatePage(id: string, payload: Partial<PageItem>) {
    return patch<PageItem>(`/content/pages/${id}`, payload)
  },
  changeStatus(id: string, status: ContentStatus) {
    return patch<PageItem>(`/content/pages/${id}/status`, { status })
  },
  geoCheck(id: string) {
    return get<GeoCheckResult>(`/content/pages/${id}/geo-check`)
  },
  removePage(id: string) {
    return del<{ id: string }>(`/content/pages/${id}`)
  }
}
