/**
 * 后台用户接口：用户 CRUD 与「用户 → 角色」绑定
 */
import { get, post, patch, del, type Paged } from './http'

/** 后台用户实体 */
export interface AdminUserItem {
  id: string
  username: string
  displayName: string | null
  roleId: string
  roleCode: string
  roleName: string
  platform: boolean
  siteIds: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminUserPayload {
  username?: string
  password?: string
  displayName?: string
  roleId?: string
  siteIds?: string[]
  enabled?: boolean
}

export const adminUsersApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string; roleId?: string } = {}) {
    return get<Paged<AdminUserItem>>('/admin-users', params as Record<string, unknown>)
  },
  create(payload: AdminUserPayload) {
    return post<AdminUserItem>('/admin-users', payload)
  },
  /** 编辑：username 不可改，password 留空表示不修改 */
  update(id: string, payload: AdminUserPayload) {
    return patch<AdminUserItem>(`/admin-users/${id}`, payload)
  },
  remove(id: string) {
    return del<{ id: string }>(`/admin-users/${id}`)
  }
}
