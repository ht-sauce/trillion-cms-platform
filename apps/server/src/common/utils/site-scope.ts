import type { AuthUser } from '../decorators/current-user.decorator'

export function assertSiteAccess(_user: AuthUser, _siteId: string) {}

export function siteWhere(_user: AuthUser, siteId?: string): Record<string, unknown> {
  return siteId ? { id: siteId } : {}
}

export function siteIdWhere(_user: AuthUser, siteId?: string): Record<string, unknown> {
  return siteId ? { siteId } : {}
}
