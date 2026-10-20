/**
 * 站点会员接口（管理侧）
 */
import { get, post, del, type Paged } from './http'

export interface MemberItem {
  id: string
  siteId: string
  username: string
  nickname: string | null
  createdAt: string
}

export const membersApi = {
  list(params: { siteId: string; keyword?: string; page?: number; pageSize?: number }) {
    return get<Paged<MemberItem>>('/members', params as Record<string, unknown>)
  },
  create(payload: { siteId: string; username: string; password: string; nickname?: string }) {
    return post<MemberItem>('/members', payload)
  },
  remove(id: string) {
    return del<{ id: string }>(`/members/${id}`)
  }
}
