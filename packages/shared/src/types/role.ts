/**
 * 后台角色类型契约
 * 权限模型：用户 →（绑定）角色 →（授权）菜单；角色的 platform 标记决定是否为平台级角色
 */

/** 角色状态 */
export type RoleStatus = 'active' | 'disabled'

/** 后台角色实体 */
export interface RoleEntity {
  id: string
  /** 角色标识（唯一，代码引用），如 admin / site_admin */
  code: string
  /** 角色名称（中文展示） */
  name: string
  /** 角色说明 */
  description: string | null
  /** 是否平台级角色：可执行平台级操作并访问平台级接口 */
  platform: boolean
  /** 是否内置角色：内置角色禁止删除 */
  builtin: boolean
  /** 状态：active=启用 / disabled=停用 */
  status: RoleStatus
  /** 排序，升序 */
  sort: number
  /** 创建时间（YYYY-MM-DD HH:mm:ss） */
  createdAt: string
  /** 更新时间（YYYY-MM-DD HH:mm:ss） */
  updatedAt: string
}
