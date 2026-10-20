/**
 * 导航配置接口（独立配置数据，**不从内容树推导**，见 ADR-029）
 * 分组固定五个：头部主导航 header + 页脚四列 footer-1 ~ footer-4；整组全量覆盖保存
 */
import { get, put } from './http'
import type { NavigationItemStatus, NavigationKey } from '@trillion/shared'

/** 导航项（服务端回填 pagePath / title / invalid） */
export interface NavigationItem {
  id: string
  navigationId: string
  label: string
  /** 站内页面 ID（与 href 二选一） */
  pageId: string | null
  /** 外部链接或自定义地址 */
  href: string | null
  sort: number
  status: NavigationItemStatus
  /** 关联页面的解析路径 */
  pagePath: string | null
  /** 关联页面标题 */
  title: string | null
  /** 失效：既无链接也无页面，或页面未发布 */
  invalid: boolean
}

/** 导航分组 */
export interface NavigationGroup {
  id: string
  siteId: string
  key: NavigationKey
  title: string
  sort: number
  items: NavigationItem[]
}

/** 整组全量提交入参 */
export interface NavigationSavePayload {
  siteId: string
  title?: string
  items: { label: string; pageId?: string | null; href?: string | null; status?: NavigationItemStatus }[]
}

export const navigationsApi = {
  /** 导航分组列表（缺省分组由服务端自动补齐） */
  list(siteId: string) {
    return get<NavigationGroup[]>('/navigations', { siteId })
  },
  /** 保存分组（整组全量覆盖） */
  save(key: NavigationKey, payload: NavigationSavePayload) {
    return put<NavigationGroup[]>(`/navigations/${key}`, payload)
  }
}
