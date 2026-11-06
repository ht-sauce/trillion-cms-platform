/**
 * 站点统一入口中间件（ADR-045，2026-11-02）
 *
 * 线上所有站点流量统一由 GEO 服务承接（nginx 只按主域名做薄 server 块反代 + 透传 Host）：
 *   1. Host 非回环时，按域名解析站点（GET /public/site/:host，内存缓存 + 负缓存）
 *   2. 按 build-sites.mjs 的 fileOfPath 口径在 sites/<slug>/ 查找产物文件：
 *      页面 `/x` → `x/index.html`；带扩展名路径按文件直出（_nuxt / assets / robots.txt / sitemap.xml / llms.txt）
 *   3. 命中 → 磁盘直出（性能 ≈ nginx 静态托管）；未命中 → 放行 SSR 兜底（读已发布内容实时渲染）
 *   4. 带 `?__preview=` 票据一律放行 SSR 走草稿链路（09 §7.5）——预览与线上收敛为同一条入口通道
 *   5. Host 为回环（本地开发）直接放行：仍走「URL 首段前缀」形态（ADR-031），渲染层拿到的 path 与产物路径一致
 *
 * 发布管线零改动：产物目录从「nginx 的 root」变为「GEO 的磁盘缓存层」；
 * 增量构建的目录 rename 在 POSIX 下对正在读取的流安全（inode 存续），读流 error 时只断开当前响应。
 *
 */
import { createReadStream, existsSync, statSync, type Stats } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { LOOPBACK_HOSTS } from '@trillion/shared'

/** 产物根目录：env 显式指定优先，缺省 <cwd>/sites（release / PM2 的 cwd 均为 apps/geo） */
const productsRoot = process.env.SITE_PRODUCTS_DIR || resolve(process.cwd(), 'sites')

/** 站点解析缓存：host → slug | null（null = 不存在，负缓存防止恶意 Host 打爆服务端） */
const siteCache = new Map<string, { slug: string | null; expires: number }>()
const SITE_CACHE_TTL = 60_000
const SITE_NEGATIVE_TTL = 30_000
const SITE_LOOKUP_TIMEOUT = 2_000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json'
}

/**
 * 产物文件相对路径（与 build-sites.mjs 的 fileOfPath 同口径）：
 * `/` → index.html；`/about`、`/about/` → about/index.html；
 * 带扩展名的路径（_nuxt 资产、robots.txt …）→ 原样。
 */
function fileOfPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'index.html'
  if (extname(pathname)) return pathname.replace(/^\/+/, '')
  return `${pathname.replace(/^\/+|\/+$/g, '')}/index.html`
}

/** 按 Host 解析站点 slug（带缓存；失败返回 null 并放行 SSR，由渲染层自行兜底） */
async function resolveSiteSlug(host: string): Promise<string | null> {
  const cached = siteCache.get(host)
  if (cached && cached.expires > Date.now()) return cached.slug

  let slug: string | null = null
  try {
    const apiBase = String(useRuntimeConfig().public.apiBase || '')
    if (apiBase) {
      const result = await $fetch<{ code: number; data: { slug: string } }>(
        `${apiBase}/public/site/${encodeURIComponent(host)}`,
        { signal: AbortSignal.timeout(SITE_LOOKUP_TIMEOUT) }
      )
      slug = result.data?.slug || null
    }
  } catch {
    slug = null
  }
  siteCache.set(host, { slug, expires: Date.now() + (slug ? SITE_CACHE_TTL : SITE_NEGATIVE_TTL) })
  return slug
}

/** 产物查找：返回文件信息；未命中返回 null（未命中是常态而非异常，不抛错） */
function findProduct(slug: string, pathname: string): { abs: string; rel: string; stat: Stats } | null {
  if (pathname.includes('\\') || pathname.split('/').includes('..')) return null
  const rel = fileOfPath(pathname)
  const abs = join(productsRoot, slug, rel)
  try {
    if (!existsSync(abs)) return null
    const stat = statSync(abs)
    if (!stat.isFile()) return null
    return { abs, rel, stat }
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  if (import.meta.dev) return
  const { req, res } = event.node
  const host = (req.headers.host || '').split(':')[0]

  if (!host || LOOPBACK_HOSTS.includes(host)) return

  /** 非 GET/HEAD、带预览票据、/static 代理：一律放行 */
  const method = (req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return
  if (event.path.includes('__preview=')) return
  if (event.path === '/static' || event.path.startsWith('/static/')) return
  if (event.path.startsWith('/demand-widget/')) return

  const pathname = event.path.split('?')[0]

  const slug = await resolveSiteSlug(host)
  if (!slug) return

  const product = findProduct(slug, pathname)

  /**
   * 构建期禁止 HTML 直出（SITES_STATIC_DISABLED=1，仅由 build-sites 的渲染进程注入）
   *
   * 为什么必须有这个开关：build-sites 按「站点 Host」向刚构建好的渲染服务请求页面，
   * 而产物目录里通常已经躺着**上一版**的同名 HTML —— 中间件会把它直出，
   * 于是「重新构建」拿到的仍是上次的页面，内容永远不更新（症状：改了块或页面数据、
   * 构建日志一切正常，产物纹丝不动）。
   * 只挡 HTML：`_nuxt` / `assets` 等静态资产与 `_payload.json` 仍走直出，
   * 后者是 JSON 数据文件，由产物提供才正确。线上不设该变量，行为不变。
   */
  const skipHtmlDirect = process.env.SITES_STATIC_DISABLED === '1' && product?.abs.endsWith('.html')

  if (!product || skipHtmlDirect) return

  const ext = extname(product.abs).toLowerCase()
  setHeader(event, 'Content-Type', MIME[ext] || 'application/octet-stream')
  setHeader(event, 'Content-Length', String(product.stat.size))
  setHeader(event, 'Last-Modified', product.stat.mtime.toUTCString())
  if (ext === '.html') {
    /** HTML 不缓存：发布即生效（配合 Last-Modified 仍可 304） */
    setHeader(event, 'Cache-Control', 'no-cache')
  } else if (product.rel.startsWith('_nuxt/')) {
    /** 客户端资产带内容 hash，可永久缓存 */
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    setHeader(event, 'Cache-Control', 'public, max-age=86400')
  }

  /** 浏览器条件请求：产物未更新时 304，免重传正文 */
  const ims = req.headers['if-modified-since']
  if (ims) {
    const since = new Date(ims).getTime()
    if (!Number.isNaN(since) && Math.floor(product.stat.mtime.getTime() / 1000) * 1000 <= since) {
      res.statusCode = 304
      res.end()
      return
    }
  }

  if (method === 'HEAD') {
    res.end()
    return
  }

  /** 直出产物文件；读取中断（增量构建 rename 竞态窗口）只断开当前响应 */
  const stream = createReadStream(product.abs)
  stream.on('error', () => res.destroy())
  return sendStream(event, stream)
})
