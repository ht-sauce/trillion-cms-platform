/**
 * 埋点与 AI 爬虫监控接口
 */
import { get } from './http'

export interface TrackOverview {
  siteId: string
  days: number
  pv: number
  uv: number
  topPages: { path: string; pv: number }[]
}

export interface AiOverview {
  siteId: string
  days: number
  total: number
  bots: { botType: string; count: number }[]
  paths: { path: string; count: number }[]
}

export const trackApi = {
  overview(siteId: string, days = 7) {
    return get<TrackOverview>('/track/overview', { siteId, days })
  },
  aiOverview(siteId: string, days = 7) {
    return get<AiOverview>('/track/ai-overview', { siteId, days })
  }
}
