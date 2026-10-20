/** 统一 API 响应结构（服务端 TransformInterceptor 产出） */
export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}

/** 分页响应 */
export interface PagedResult<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 登录成功返回 */
export interface LoginPayload {
  token: string
  user: AdminUserEntity
}

/** 管理后台用户（角色信息随用户返回，前端不再维护角色枚举） */
export interface AdminUserEntity {
  id: string
  username: string
  displayName: string | null
  /** 绑定的角色 ID */
  roleId: string
  /** 角色标识，如 admin */
  roleCode: string
  /** 角色名称（中文展示） */
  roleName: string
  /** 是否平台级角色 */
  platform: boolean
  /** 可管理的站点 ID 列表；平台级角色为空表示全部 */
  siteIds: string[]
}

/** 站点会员 */
export interface MemberEntity {
  id: string
  siteId: string
  username: string
  nickname: string | null
  createdAt: string
}

/** 埋点上报载荷 */
export interface TrackPayload {
  siteId: string
  path: string
  referrer: string
  anonId: string
}

/** AI 爬虫事件（服务端采集后入库） */
export interface AiCrawlInput {
  siteId: string
  botType: string
  path: string
  status: number
  bytes: number
}
