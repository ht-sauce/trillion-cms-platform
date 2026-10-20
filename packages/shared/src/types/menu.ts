/**
 * 后台菜单类型契约
 * 菜单由服务端配置（menu 表）驱动，管理后台侧栏按登录角色动态渲染，最多三级
 */

/** 菜单状态 */
export type MenuStatus = 'active' | 'disabled'

/** 后台菜单实体（平铺结构，parentId 自关联） */
export interface MenuEntity {
  id: string
  /** 上级菜单 ID，null 表示一级菜单 */
  parentId: string | null
  /** 菜单名称，侧栏展示文本 */
  title: string
  /** 路由路径；目录型菜单为 null，仅用于展开子菜单 */
  path: string | null
  /** 同级排序，升序 */
  sort: number
  /** 是否在侧栏可见 */
  visible: boolean
  /** 状态：active=启用 / disabled=停用 */
  status: MenuStatus
  /** 创建时间（YYYY-MM-DD HH:mm:ss） */
  createdAt: string
  /** 更新时间（YYYY-MM-DD HH:mm:ss） */
  updatedAt: string
}

/** 侧栏菜单树节点（最多三级，由服务端按当前用户角色的菜单授权过滤后构建） */
export interface MenuTreeNode {
  id: string
  parentId: string | null
  title: string
  path: string | null
  sort: number
  visible: boolean
  status: MenuStatus
  children: MenuTreeNode[]
}
