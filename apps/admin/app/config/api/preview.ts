/**
 * 预览接口：后台发起票据 → 渲染引擎按票据读取「线上快照 + 草稿覆盖」
 * 票据默认 30 分钟有效，只能读单页草稿；iframe 直接加载返回的 url
 */
import { post } from './http'

/** 预览票据结果 */
export interface PreviewTicket {
  /** 可直接塞进 iframe src 的完整地址 */
  url: string
  ticket: string
  path: string
  /** 渲染引擎基址（未配置时为 null，iframe 会打不开） */
  host: string | null
  expiresAt: string
}

export const previewApi = {
  /** 生成预览票据 */
  ticket(siteId: string, pageId: string) {
    return post<PreviewTicket>('/preview/ticket', { siteId, pageId })
  }
}
