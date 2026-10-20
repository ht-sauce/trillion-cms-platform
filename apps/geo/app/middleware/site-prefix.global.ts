/**
 * 站点前缀统一补齐（本地回环地址下的唯一规则，与 useSiteKey 的解析口径对称）
 *
 * 本地多个站点共用同一个 GEO 端口（`config/ports.mjs` 的 geo 3002），站点标识只能来自 URL 首段前缀；
 * 而站内链接（导航配置的 `pagePath`、页脚、Block 里写死的 `to="/visit"`）都是**不带前缀的真实路径**，
 * 一旦点击或刷新就会掉前缀、退回环境变量指定的默认站点——表现为「预览 B 站点却跳到 A 站点」。
 *
 * 所以前缀只在**一处**补齐：缺前缀的页面路径统一改写成 `/<slug><path>`，一次覆盖
 * 首屏 SSR、客户端导航（含 Block 内链）、刷新与新窗口打开；query（含预览票据）与 hash 原样保留。
 *
 * prefix 为空时（SSG 构建期 / 线上域名 / 局域网 IP）本中间件不做任何事。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  /** Nuxt 内部资源（/_nuxt、/_payload.json）与静态文件（robots.txt 等）不参与站点前缀规则 */
  if (to.path.startsWith('/_') || /\.[a-z0-9]+$/i.test(to.path)) return

  const { context, resolve } = useSiteContext()
  await resolve()

  const prefix = context.value.prefix
  if (!prefix) return

  /** 判断按「路径段」而非字符串前缀：站点 slug 是另一个路径段开头时不会误判 */
  const root = `/${prefix}`
  if (to.path === root || to.path.startsWith(`${root}/`)) return

  return navigateTo(
    { path: to.path === '/' ? root : `${root}${to.path}`, query: to.query, hash: to.hash },
    { redirectCode: 302 }
  )
})
