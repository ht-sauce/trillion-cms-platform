/**
 * 菜单接口：侧栏动态菜单树（按角色过滤）+ 菜单配置维护
 */
import { get, post, patch, del } from './http'

export type MenuStatus = 'active' | 'disabled'

/** 菜单实体（平铺） */
export interface MenuItem {
  id: string
  parentId: string | null
  title: string
  path: string | null
  sort: number
  visible: boolean
  status: MenuStatus
  createdAt: string
  updatedAt: string
}

/** 菜单树节点（最多三级，服务端已按当前用户角色的菜单授权过滤） */
export interface MenuNode {
  id: string
  parentId: string | null
  title: string
  path: string | null
  sort: number
  visible: boolean
  status: MenuStatus
  children: MenuNode[]
}

export type MenuPayload = Partial<Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>>

export const menusApi = {
  /** 侧栏菜单树（登录即可） */
  tree() {
    return get<MenuNode[]>('/menus/tree')
  },
  /** 菜单配置列表（平铺，含隐藏与停用项，仅平台管理员） */
  list(params: { status?: string } = {}) {
    return get<{ list: MenuItem[]; total: number }>('/menus', params as Record<string, unknown>)
  },
  create(payload: MenuPayload) {
    return post<MenuItem>('/menus', payload)
  },
  update(id: string, payload: MenuPayload) {
    return patch<MenuItem>(`/menus/${id}`, payload)
  },
  remove(id: string) {
    return del<{ id: string }>(`/menus/${id}`)
  }
}
