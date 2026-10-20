/**
 * 页面数据读取：路径解析与页面详情（含结构化 Block）
 *
 * 两条数据通道：
 *   - 线上：`GET /public/page/:key?path=`（只返回已发布内容）
 *   - 预览：`GET /preview/page/:id?ticket=`（线上快照 + 整页草稿覆盖，可含未发布内容）
 *
 * 预览走哪条由 `usePreview()` 决定；票据无效时自动退回线上数据，
 * 保证「预览链接过期」不会把页面变成一个错误页。
 *
 * 路径口径：本地（回环地址）多站点共用端口时，URL 首段是**站点前缀**而非页面路径，
 * 这里统一剥离后再请求（见 useSiteKey 的解析规则），保证渲染引擎拿到的 path 与线上产物一致。
 */
import { useApiBase } from '../utils/api-base'
import { stripSitePrefix, useSiteContext } from './useSiteKey'
import { usePreview } from './usePreview'
import type { BlockInstance, EditorialInfo, PageKind } from '@trillion/shared'

export interface PageDetail {
  id: string
  title: string
  slug: string
  path: string
  kind: PageKind
  canonical: string
  templateId: string | null
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  /** 服务端算好的最终 JSON-LD（渲染引擎直接注入） */
  jsonLd: string
  jsonLdAuto: string
  jsonLdCustom: string | null
  jsonLdMode: string
  blocks: BlockInstance[]
  channel: { id: string; name: string; slug: string; path: string; ancestors: { name: string; path: string }[] } | null
  entities: { name: string; aliases: unknown; type: string; description: string | null }[]
  editorial: EditorialInfo | null
  authorName: string | null
  publishedAt: string | null
  updatedAt: string | null
  contentHash: string
  /** 预览态附加字段 */
  __preview?: boolean
  hasDraft?: boolean
  draftUpdatedAt?: string | null
}

/** 当前路由路径（首页为 /） */
export function usePagePath(): string {
  const route = useRoute()
  const raw = Array.isArray(route.params.slug) ? route.params.slug.join('/') : String(route.params.slug || '')
  return raw ? `/${raw}` : '/'
}

/**
 * 读取页面详情
 * @param path 页面路径，默认取当前路由
 */
export function usePage(path?: string) {
  const apiBase = useApiBase()
  const { context, resolve } = useSiteContext()
  const preview = usePreview()
  const rawPath = path || usePagePath()

  /**
   * state key 用**原始 URL 路径**：站点前缀要等 `resolve()`（异步）之后才知道，
   * 若用剥离后的路径作 key，同一个 URL 在 SSR（已知前缀）与客户端（前缀未知）会落到两个 key
   */
  const page = useState<PageDetail | null>(`geo-page-${rawPath}`, () => null)

  /** 真实页面路径（已剥离站点前缀） */
  const currentPath = computed(() => stripSitePrefix(rawPath, context.value.prefix))

  async function load() {
    if (page.value) return page.value

    /** 先解析站点上下文：站点标识与页面路径前缀都由它决定 */
    await resolve()

    /** 预览态：按票据指向的 pageId 取「草稿覆盖后的快照」 */
    if (preview.isPreview && preview.valid && preview.pageId) {
      const url = `${apiBase}/preview/page/${preview.pageId}?ticket=${encodeURIComponent(preview.ticket || '')}`
      const result = await $fetch<{ code: number; data: PageDetail }>(url)
      page.value = result.data
      return page.value
    }

    const url = `${apiBase}/public/page/${context.value.key}?path=${encodeURIComponent(currentPath.value)}`
    const result = await $fetch<{ code: number; data: PageDetail }>(url)
    page.value = result.data
    return page.value
  }

  return { page, path: currentPath, preview, load }
}
