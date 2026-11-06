/**
 * 需求收集管理接口
 */
import { del, get, patch, post, type Paged } from './http'

export type DemandStatus = 'pending' | 'followed'

export interface DemandBanInfo {
  id: string
  ip: string
  reason: string
  source: 'auto' | 'manual'
  expiresAt: string | null
  createdAt: string
}

export interface DemandItem {
  id: string
  siteId: string
  siteName?: string
  description: string
  contactName: string | null
  phone: string | null
  wechat: string | null
  email: string | null
  otherContact: string | null
  sourceUrl: string | null
  clientIp: string
  status: DemandStatus
  note: string | null
  createdAt: string
  updatedAt: string
  ban: DemandBanInfo | null
}

export interface DemandListParams {
  siteId?: string
  status?: DemandStatus
  keyword?: string
  page?: number
  pageSize?: number
}

export const demandsApi = {
  list(params: DemandListParams) {
    return get<Paged<DemandItem>>('/demands', params as Record<string, unknown>)
  },
  detail(id: string) {
    return get<DemandItem>(`/demands/${id}`)
  },
  saveFollowUp(id: string, payload: { status: DemandStatus; note: string }) {
    return patch<DemandItem>(`/demands/${id}/follow-up`, payload)
  },
  banIp(payload: { ip: string; reason: string }) {
    return post<DemandBanInfo>('/demands/ip-bans', payload)
  },
  unbanIp(ip: string) {
    return del<{ ip: string }>(`/demands/ip-bans/${encodeURIComponent(ip)}`)
  }
}
