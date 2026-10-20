/**
 * 站点上下文解析：站点标识（key）+ URL 站点前缀（prefix）
 *
 * 一个 Host 可能同时托管多个站点，定位站点分三种运行形态：
 *   1. SSG 构建期（import.meta.prerender）：站点由 NUXT_PUBLIC_SITE_SLUG 指定，URL 路径即产物路径，不解析前缀
 *   2. SSR / 线上 / 局域网：以请求 Host（主域名与别名域名，见 ADR-022）作为站点标识，路径不含前缀
 *   3. 本地开发（回环地址）：多个站点共用同一端口（`config/ports.mjs` 的 geo 3002），
 *      **站点标识 = URL 首段**，且前缀恒等于该标识（含环境变量指定的默认站点）：
 *      `http://localhost:3002/star-tech`、`http://localhost:3002/example-site`；
 *      渲染时把前缀**剥离**，让引擎拿到的 path 与线上产物一致（`/doctors`，而不是 `/<slug>/doctors`）
 *
 * 为什么回环地址下连站内路径也要带前缀：本地各站点的 `Site.domain` 往往都填 `localhost:3002`，
 * 域名无法区分站点，前缀是唯一的站点标识——URL 一旦丢掉它（刷新、新窗口、内链跳转），
 * 站点就退化成「环境变量默认站点」，表现为「预览 B 站点却看到 A 站点」。
 * 缺前缀的站内路径由 `middleware/site-prefix.global.ts` 在**唯一一处**统一补齐。
 */
import { LOOPBACK_HOSTS, useApiBase } from '../utils/api-base'

export interface SiteContext {
  /** 服务端站点标识：slug 或域名（服务端 `findSiteByKey` 两者都认） */
  key: string
  /** URL 站点前缀：仅本地回环地址下多站点共用端口时非空 */
  prefix: string
  /** 是否已完成解析（SSR 解析结果随 payload 传给客户端，避免二次请求与 hydration 漂移） */
  ready: boolean
}

/** URL 路径首段：`/example-site/doctors` → `example-site` */
function firstSegment(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0] || ''
}

/** 剥离站点前缀：`/example-site/doctors` → `/doctors`；`/example-site` → `/` */
export function stripSitePrefix(path: string, prefix: string): string {
  if (!prefix) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === `/${prefix}`) return '/'
  if (normalized.startsWith(`/${prefix}/`)) return normalized.slice(prefix.length + 1) || '/'
  return normalized
}

export function useSiteContext() {
  const cfg = useRuntimeConfig()
  const apiBase = useApiBase()
  const state = useState<SiteContext>('geo-site-context', () => ({ key: '', prefix: '', ready: false }))

  /** 请求 Host（不含端口）：SSR 取请求头，客户端取当前地址 */
  const requestHost = import.meta.client
    ? window.location.hostname
    : (useRequestHeaders(['host']).host || '').split(':')[0]

  /** 当前 URL 路径（SSR 为请求路径，客户端为地址栏路径） */
  const requestPath = useRequestURL().pathname

  /** 环境变量指定的站点：SSG 构建期与「本地未带前缀」时的回退值 */
  function fallbackKey(): string {
    return String(cfg.public.siteSlug || '')
  }

  /** 该标识是否确有对应站点（服务端按 slug / 主域名 / 别名域名解析） */
  async function siteExists(key: string): Promise<boolean> {
    try {
      await $fetch(`${apiBase}/public/site/${encodeURIComponent(key)}`)
      return true
    } catch {
      return false
    }
  }

  async function resolve(): Promise<SiteContext> {
    if (state.value.ready) return state.value

    /** 1) SSG 构建期：路径即产物路径，站点由环境变量指定 */
    if (import.meta.prerender) {
      state.value = { key: fallbackKey(), prefix: '', ready: true }
      return state.value
    }

    /** 2) 线上 / 局域网：域名（或主机名）即站点标识 */
    if (requestHost && !LOOPBACK_HOSTS.includes(requestHost)) {
      state.value = { key: requestHost, prefix: '', ready: true }
      return state.value
    }

    /** 3) 本地回环：URL 首段确为站点标识时，它既是站点 key 也是待剥离的前缀 */
    const candidate = firstSegment(requestPath)
    if (candidate && (await siteExists(candidate))) {
      state.value = { key: candidate, prefix: candidate, ready: true }
      return state.value
    }

    /**
     * 无前缀（或首段不是站点）：落到环境变量指定的默认站点，**前缀同样取该站点 slug**——
     * 回环地址下站点只能靠前缀表达，缺前缀的地址会被中间件补齐成 `/<slug>`
     */
    const fallback = fallbackKey()
    state.value = { key: fallback, prefix: fallback, ready: true }
    return state.value
  }

  return { context: state, resolve }
}

/** 站点标识（数据请求用；解析前回退到环境变量） */
export function useSiteKey() {
  const { context } = useSiteContext()
  const cfg = useRuntimeConfig()
  return computed(() => context.value.key || String(cfg.public.siteSlug || ''))
}
