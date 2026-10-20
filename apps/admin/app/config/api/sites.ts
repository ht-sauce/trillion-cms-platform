/**
 * 站点接口
 */
import { get, post, patch, del, type Paged } from './http'
import type { BuildTask } from './publish'

export interface SiteItem {
  id: string
  name: string
  slug: string
  /** 主域名（唯一规范地址）：列表「预览」与 SEO 绝对 URL 都用它 */
  domain: string
  /** 别名域名（不含主域名）：多域名映射，全量提交 */
  domains: string[]
  companyName: string
  creditCode: string | null
  companyAddress: string | null
  contactPhone: string | null
  contactEmail: string | null
  icpNumber: string | null
  policeNumber: string | null
  businessLicenseFileId: string | null
  logoFileId: string | null
  faviconFileId: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  defaultLocale: string
  robotsPolicy: { allowAllAi: boolean; blockedAgents: string[]; extraAllowedAgents: string[] }
  renderMode: 'ssg' | 'ssr'
  themeConfig: { primary: string; accent: string; background: string; text: string; radius?: number }
  status: 'active' | 'disabled'
  /** 最新构建任务（`null` = 从未构建）：站点列表「构建状态」列的数据来源 */
  build: BuildTask | null
  createdAt: string
  updatedAt: string
}

export type SitePayload = Partial<SiteItem>

export const sitesApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string; renderMode?: string; status?: string } = {}) {
    return get<Paged<SiteItem>>('/sites', params as Record<string, unknown>)
  },
  detail(id: string) {
    return get<SiteItem & { businessLicenseUrl: string | null; logoUrl: string | null; faviconUrl: string | null }>(
      `/sites/${id}`
    )
  },
  create(payload: SitePayload) {
    return post<SiteItem>('/sites', payload)
  },
  update(id: string, payload: SitePayload) {
    return patch<SiteItem>(`/sites/${id}`, payload)
  },
  remove(id: string) {
    return del<{ id: string }>(`/sites/${id}`)
  }
}
