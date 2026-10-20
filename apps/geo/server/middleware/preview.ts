/**
 * 预览通道服务端中间件（09 §7.5）
 *
 * 后台 iframe 打开 `http://<预览宿主>/<path>?__preview=<票据>` 时：
 *   1. 向服务端解析票据（渲染引擎无法自行解密 HMAC），拿到 pageId
 *   2. 把票据信息挂到请求上下文，供 usePage 改取「草稿」数据
 *   3. 输出 `X-Robots-Tag: noindex` —— 预览态绝不能被搜索引擎收录
 *
 * 票据解析失败**不阻断请求**：继续按线上内容渲染，
 * 这样「票据过期」表现为「看到的是线上版本」而不是一个 500 页，运营更容易理解发生了什么。
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const ticket = url.searchParams.get('__preview')
  if (!ticket) return

  const apiBase = useRuntimeConfig().public.apiBase as string

  event.context.preview = { ticket, pageId: null, siteId: null, valid: false }
  /** 无论票据是否有效，预览请求一律不收录 */
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  /** 预览态关闭缓存：否则改完草稿刷新看到的还是旧内容 */
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    const result = await $fetch<{ code: number; data: { pageId: string; siteId: string } }>(
      `${apiBase}/preview/resolve?ticket=${encodeURIComponent(ticket)}`
    )
    event.context.preview = {
      ticket,
      pageId: result.data.pageId,
      siteId: result.data.siteId,
      valid: true
    }
  } catch {
    // 票据无效：保留 valid=false，页面按线上内容渲染
  }
})
