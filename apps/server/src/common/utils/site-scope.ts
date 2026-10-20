/**
 * 站点数据权限
 * 原则：菜单只是体验，这里是真正的安全边界——所有按站点查询的接口必须过 scope；
 * 平台级角色可访问全部站点，其余角色仅能访问 siteIds 内站点
 */
import { ForbiddenException } from '@nestjs/common'
import type { AuthUser } from '../decorators/current-user.decorator'

export function assertSiteAccess(user: AuthUser, siteId: string) {
  if (user.platform) return
  const ids = Array.isArray(user.siteIds) ? user.siteIds : []
  if (!ids.includes(siteId)) {
    throw new ForbiddenException(`无权访问站点 siteId=${siteId}`)
  }
}

/** 生成 Prisma 查询所需的站点过滤条件（平台级角色返回空对象表示不过滤） */
export function siteWhere(user: AuthUser, siteId?: string): Record<string, unknown> {
  if (user.platform) {
    return siteId ? { id: siteId } : {}
  }
  const ids = Array.isArray(user.siteIds) ? user.siteIds : []
  if (siteId) {
    assertSiteAccess(user, siteId)
    return { id: siteId }
  }
  return { id: { in: ids } }
}

/** 站点列表过滤（用于 xxx.siteId 字段的查询） */
export function siteIdWhere(user: AuthUser, siteId?: string): Record<string, unknown> {
  const scoped = siteWhere(user, siteId || undefined)
  if ('id' in scoped) {
    const value = scoped.id
    return {
      siteId:
        typeof value === 'object' && value !== null && 'in' in value ? { in: (value as { in: string[] }).in } : value
    }
  }
  return {}
}
