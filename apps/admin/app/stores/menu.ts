/**
 * 菜单 store：侧栏菜单完全由后台配置驱动
 * 登录后从 /menus/tree 拉取当前角色可见的菜单树（最多三级），并缓存避免重复请求
 */
import { defineStore } from 'pinia'
import { menusApi, type MenuNode } from '~/config/api'

/** 在菜单树中按路径查标题（顶栏面包屑使用） */
function findTitle(nodes: MenuNode[], path: string): string {
  for (const node of nodes) {
    if (node.path === path) return node.title
    const hit = findTitle(node.children, path)
    if (hit) return hit
  }
  return ''
}

export const useMenuStore = defineStore('menu', {
  state: () => ({
    tree: [] as MenuNode[],
    loaded: false,
    loading: false
  }),
  actions: {
    /** 拉取菜单树；已加载过则直接复用（force=true 用于菜单配置变更后刷新） */
    async load(force = false) {
      if (this.loading) return
      if (this.loaded && !force) return
      this.loading = true
      try {
        this.tree = await menusApi.tree()
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    /** 按路径取菜单标题（缺失时返回空串，由调用方兜底） */
    titleOf(path: string) {
      return findTitle(this.tree, path)
    },
    /** 退出登录或切换账号时清空，避免残留上一个角色的菜单 */
    reset() {
      this.tree = []
      this.loaded = false
    }
  }
})
