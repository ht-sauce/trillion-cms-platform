/**
 * 菜单树工具：平铺列表 ↔ 多级树（菜单管理页与角色菜单授权页共用）
 */
import type { MenuItem, MenuNode } from '~/config/api'

/** 平铺列表 → 多级树（父级缺失的节点不越级提升） */
export function buildMenuTree(items: MenuItem[]): MenuNode[] {
  const map = new Map<string, MenuNode>()
  for (const item of items) map.set(item.id, { ...item, children: [] })

  const roots: MenuNode[] = []
  for (const item of items) {
    const node = map.get(item.id)
    if (!node) continue
    if (!item.parentId) {
      roots.push(node)
      continue
    }
    const parent = map.get(item.parentId)
    if (parent) parent.children.push(node)
  }
  return roots
}

/** 多级树 → 带层级的扁平数组（表格渲染用，父级在子级之前） */
export function flattenMenuTree(nodes: MenuNode[], depth = 1): (MenuNode & { depth: number })[] {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenMenuTree(node.children, depth + 1)])
}
