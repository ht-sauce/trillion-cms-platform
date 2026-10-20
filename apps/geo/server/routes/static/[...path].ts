/**
 * /static 静态资源同源代理（Nitro 服务端路由）
 *
 * 背景：站点图片迁移到服务端素材库后，页面里的图片 URL 形如 /static/<yyyy>/<mm>/<uuid>.<ext>，
 * 物理文件由服务端 useStaticAssets 映射（apps/server/src/main.ts）。GEO 站点与内容同源部署，
 * 浏览器 / SSR 会向 GEO 站点自身的 /static/** 发请求，本路由把请求原样转发到服务端，
 * dev SSR（nuxt dev）与缓存渲染服务（构建产物 SSR）两条运行形态同时生效（ADR-032）。
 *
 * 实现取舍：项目内无既有代理约定（nuxt.config 未用 routeRules.proxy / devProxy），
 * 故用 Nitro 路由 + h3 的 proxyRequest（Nitro 自动导入全部 h3 导出，无需显式 import）——
 * 上游状态码（含 404）、content-type 等响应头与查询串原样透传，响应体流式回写。
 */
export default defineEventHandler((event) => {
  const apiBase = String(useRuntimeConfig().public.apiBase || '')
  if (!apiBase) {
    throw createError({ statusCode: 500, message: '缺少 API 基址：请通过 pnpm allDev / pnpm dev:geo 启动' })
  }

  /**
   * apiBase 形如 http://<host>:<port>/geoserver（含服务端全局路由前缀 /geoserver，
   * 唯一事实来源是根 config/index.mjs 的 API 前缀定义）；
   * 静态资源挂在服务根路径（useStaticAssets 的 prefix 不受 setGlobalPrefix 影响），需剥掉 /geoserver 后缀。
   * 显式 API_BASE 不以 /geoserver 结尾时按原样使用（视为已指向服务根）。
   */
  const serverBase = apiBase.replace(/\/geoserver\/?$/, '') || apiBase
  /** 与 main.ts 同口径：对外 URL 前缀可被 env 覆盖，缺省 /static */
  const staticPrefix = (process.env.PUBLIC_URL_PREFIX || '/static').replace(/\/+$/, '')
  /** event.path 为原始编码路径（含查询串），直接切片透传，避免解码/再编码漂移 */
  const rest = event.path.slice('/static'.length)

  return proxyRequest(event, `${serverBase}${staticPrefix}${rest}`)
})
