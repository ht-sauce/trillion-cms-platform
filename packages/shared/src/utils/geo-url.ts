/**
 * 站点地址与「站点前缀」的唯一实现（服务端 / 管理后台 / GEO 渲染引擎共用）
 *
 * 背景：站点在线上由**域名**标识（一域名一站点），本地开发却多个站点共用同一个 GEO 端口
 * （`config/ports.mjs` 的 geo 3002），此时站点只能靠 **URL 首段 = 站点 slug** 区分。
 * 因此「站点地址怎么拼」必须只有一处实现：预览票据、站点列表「预览」、
 * 渲染引擎的 Host/前缀解析若各拼一份，迟早漂移成「打开 B 站点却看到 A 站点」这类映射错误。
 *
 * 规则（三个入口一致）：
 *   - 基址是回环地址（localhost / 127.0.0.1 …）→ 前缀 `/<slug>`（多站点共用端口，必须显式区分）
 *   - 基址是真实域名                        → 无前缀（域名本身就是站点标识，见 ADR-022）
 */

/** 回环主机名：本地多站点共用端口时区分站点的识别清单（GEO 的 Host 解析与地址拼装共用同一份） */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']

/** 从地址取主机名（不含端口）；缺协议时按 http 补全，解析失败返回空串 */
export function hostnameOf(url: string): string {
  const value = String(url || '').trim()
  if (!value) return ''
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`).hostname
  } catch {
    return ''
  }
}

/** 该地址是否指向本机回环（= 本地开发形态，多站点共用端口） */
export function isLoopbackUrl(url: string): boolean {
  return LOOPBACK_HOSTS.includes(hostnameOf(url))
}

/** 归一化基址：缺协议按 http 补全，去掉尾部斜杠；空值返回空串 */
export function normalizeBaseUrl(url: string): string {
  const value = String(url || '')
    .trim()
    .replace(/\/+$/, '')
  if (!value) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`
}

/** 站点前缀（含前导斜杠）：回环基址返回 `/<slug>`，域名基址返回空串 */
export function siteUrlPrefix(base: string, slug: string): string {
  const key = String(slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  if (!key) return ''
  return isLoopbackUrl(base) ? `/${key}` : ''
}

/**
 * 拼装站点地址：`<base><站点前缀><path>`
 * 首页（`/`）不产生尾斜杠，避免出现 `http://localhost:3002/star-tech/` 这类两种写法
 */
export function buildSiteUrl(base: string, slug: string, path = '/'): string {
  const root = normalizeBaseUrl(base)
  if (!root) return ''
  const prefix = siteUrlPrefix(root, slug)
  const raw = String(path || '/').trim()
  const suffix = raw.startsWith('/') ? raw : `/${raw}`
  return `${root}${prefix}${suffix === '/' ? '' : suffix}`
}
