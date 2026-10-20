/**
 * 导航配置契约（独立配置数据，**不从内容树推导**，见 09 §3.4 与 ADR-029）
 * 分组：头部主导航 header + 页脚四列 footer-1 ~ footer-4
 */

/** 导航分组键：头部 + 页脚四列 */
export type NavigationKey = 'header' | 'footer-1' | 'footer-2' | 'footer-3' | 'footer-4'

/** 导航分组键清单（seed 与后台下拉共用） */
export const NAVIGATION_KEYS: NavigationKey[] = ['header', 'footer-1', 'footer-2', 'footer-3', 'footer-4']

/** 导航分组默认标题 */
export const NAVIGATION_KEY_LABELS: Record<NavigationKey, string> = {
  header: '头部主导航',
  'footer-1': '页脚第一列',
  'footer-2': '页脚第二列',
  'footer-3': '页脚第三列',
  'footer-4': '页脚第四列'
}

/** 导航项状态 */
export type NavigationItemStatus = 'active' | 'disabled'

/** 导航分组 */
export interface NavigationEntity {
  id: string
  siteId: string
  key: NavigationKey
  title: string
  sort: number
  items: NavigationItemEntity[]
}

/** 导航项（指向页面或外部链接；两者皆无时后台告警） */
export interface NavigationItemEntity {
  id: string
  navigationId: string
  label: string
  /** 关联页面 ID（站内跳转） */
  pageId: string | null
  /** 外部链接或自定义地址 */
  href: string | null
  sort: number
  status: NavigationItemStatus
  /** 关联页面的解析路径（服务端回填，供后台预览与站点渲染使用） */
  pagePath?: string | null
  /** 失效告警：既无 pageId 也无 href，或关联页面已不存在 */
  invalid?: boolean
}

/** 整组全量提交的入参（PUT /navigations/:key） */
export interface NavigationSaveInput {
  siteId: string
  title?: string
  items: {
    label: string
    pageId?: string | null
    href?: string | null
    status?: NavigationItemStatus
  }[]
}
