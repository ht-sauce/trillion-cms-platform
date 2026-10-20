/**
 * 角色接口：角色 CRUD 与「角色 → 菜单」授权
 */
import { get, post, patch, put, del } from './http'

export type RoleStatus = 'active' | 'disabled'

/** 角色实体（含授权菜单与绑定用户数） */
export interface RoleItem {
  id: string
  code: string
  name: string
  description: string | null
  platform: boolean
  builtin: boolean
  status: RoleStatus
  sort: number
  /** 该角色已授权的菜单 ID 列表 */
  menuIds: string[]
  /** 绑定了该角色的用户数 */
  userCount: number
  createdAt: string
  updatedAt: string
}

export type RolePayload = Partial<
  Omit<RoleItem, 'id' | 'menuIds' | 'userCount' | 'builtin' | 'createdAt' | 'updatedAt'>
>

export const rolesApi = {
  list(params: { keyword?: string; status?: string } = {}) {
    return get<{ list: RoleItem[]; total: number }>('/roles', params as Record<string, unknown>)
  },
  create(payload: RolePayload) {
    return post<RoleItem>('/roles', payload)
  },
  update(id: string, payload: RolePayload) {
    return patch<RoleItem>(`/roles/${id}`, payload)
  },
  remove(id: string) {
    return del<{ id: string }>(`/roles/${id}`)
  },
  /** 覆盖式保存角色的菜单授权（服务端自动补全上级菜单） */
  saveMenus(id: string, menuIds: string[]) {
    return put<{ id: string; menuIds: string[] }>(`/roles/${id}/menus`, { menuIds })
  }
}
