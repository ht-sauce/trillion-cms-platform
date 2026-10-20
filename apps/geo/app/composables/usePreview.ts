/**
 * 预览态读取（09 §7.5）
 *
 * 数据来源是服务端中间件挂到请求上下文的票据解析结果；
 * SSG 构建期没有请求上下文，因此预览态恒为 false —— 预览只走 SSR/开发服务器，这是预期行为。
 */
export interface PreviewState {
  isPreview: boolean
  ticket: string | null
  pageId: string | null
  siteId: string | null
  valid: boolean
}

export function usePreview(): PreviewState {
  /** 服务端：读中间件挂到请求上下文的票据解析结果 */
  const event = useRequestEvent()
  const preview = (event?.context ?? {}).preview as (PreviewState & { pageId: string | null }) | undefined
  if (preview) {
    return {
      isPreview: true,
      ticket: preview.ticket,
      pageId: preview.pageId ?? null,
      siteId: preview.siteId ?? null,
      valid: Boolean(preview.valid)
    }
  }

  /**
   * 客户端（含插件里调用）：没有请求上下文，改从地址栏判断。
   * 客户端拿不到 pageId（票据由服务端解密），但「是否处于预览态」足以决定是否上报埋点。
   */
  if (import.meta.client && typeof window !== 'undefined') {
    const ticket = new URLSearchParams(window.location.search).get('__preview')
    if (ticket) {
      return { isPreview: true, ticket, pageId: null, siteId: null, valid: true }
    }
  }

  return { isPreview: false, ticket: null, pageId: null, siteId: null, valid: false }
}
