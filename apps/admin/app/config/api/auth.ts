/**
 * 鉴权接口
 */
import { post, get } from './http'

/** 当前登录管理员（角色信息由「用户 → 角色」绑定解析） */
export interface AdminUser {
  id: string
  username: string
  displayName: string | null
  roleId: string
  roleCode: string
  roleName: string
  platform: boolean
  siteIds: string[]
}

export interface LoginPayload {
  token: string
  user: AdminUser
}

export const authApi = {
  login(username: string, password: string) {
    return post<LoginPayload>('/auth/login', { username, password })
  },
  me() {
    return get<AdminUser>('/auth/me')
  }
}
