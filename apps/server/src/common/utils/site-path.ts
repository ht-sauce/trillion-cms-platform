/**
 * 站点路径与块数据统一物化工具
 * 物化 = 把「树结构 + slug」推导出的访问地址落成数据库列，成为页面 ↔ 线上地址 ↔ 产物文件的唯一锚点。
 */

/** 拼接父路径与片段（父为 / 或空时返回 /slug） */
export function joinPath(parentPath: string | null | undefined, slug: string): string {
  const parent = (parentPath || '').replace(/\/+$/, '')
  if (!parent) return `/${slug}`
  return `${parent}/${slug}`
}

/** 首页判定：slug 为 home 或 index 的页面属于「特殊定位页」，不参与普通拼接 */
export function isHomeSlug(slug: string): boolean {
  return slug === 'home' || slug === 'index'
}

/**
 * 计算页面的物化路径
 *
 * 两个保留 slug（全站各至多一个，路径不随目录变化）：
 * - `home`  → `/`（站点首页）
 * - `index` → **所在目录的路径**（目录落地页），例如目录 `/doctors` 下的 `index` 页即 `/doctors`，
 *   其同级详情页 `li-ming` 即 `/doctors/li-ming`。
 *
 * 为什么需要 `index`：单段 URL（`/about`、`/privacy`、`/faq`）在「目录 + 页面」两级结构里
 * 无法用普通拼接表达——目录路径恒为 `/<slug>`，直接拼会得到 `/about/index` 这类无效地址。
 */
export function resolvePagePath(channelPath: string | null | undefined, slug: string): string {
  if (slug === 'home') return '/'
  if (slug === 'index') return channelPath || '/'
  return joinPath(channelPath, slug)
}

/** 校验路径片段合法性（小写字母/数字/连字符，分段） */
export function isValidPathSegment(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)
}

/** 校验目录深度（默认不超 5 层） */
export function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length
}
