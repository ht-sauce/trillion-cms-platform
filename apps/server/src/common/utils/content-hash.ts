/**
 * 页面内容指纹：决定「已发布 / 待发布 / 产物缺失」徽标的唯一口径
 *
 * 组成（任一变化即视为内容变化）：
 *   1) 页面自身字段：title / slug / path / kind / summary / seo* / authorName / editorial
 *   2) 块实例序列：id / key / enabled / data（**含停用块**：启用与否也是内容差异）
 *   3) 块代码指纹：每个被引用块当前的 codeHash —— 块代码改了，用到它的页面同样「待发布」
 *
 * 与产物清单 `_trillion.json` 的 page.contentHash 对齐：
 *   发布成功时把 contentHash 写入 Page.publishedHash，并出现在清单里；
 *   徽标判定 = Page.contentHash === Page.publishedHash ?
 */
import { createHash } from 'node:crypto'

export interface HashableBlock {
  id?: string
  key: string
  enabled?: boolean
  data?: unknown
  /**
   * 页面节奏提示（ADR-036 补充，页面级编排，非块字段）：
   * 'plain' | 'alt' | 'plain-flush' | 'alt-flush' | 'head' | 'none'
   * 缺省时由渲染器按块 key 的 SECTION_OF 清单取默认值。
   * 改节奏 = 内容变了，因此纳入页面指纹。
   */
  section?: string
}

export interface HashablePage {
  title?: string | null
  slug?: string | null
  path?: string | null
  kind?: string | null
  summary?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  seoKeywords?: string | null
  authorName?: string | null
  editorial?: unknown
  blocks?: unknown
}

/** 稳定序列化：对象键排序，保证同一内容永远得到同一字符串 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${k}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 取块实例数组（兼容历史 { type } 形态） */
function normalizeBlocks(blocks: unknown): HashableBlock[] {
  if (!Array.isArray(blocks)) return []
  return blocks
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      key: String(item.key ?? item.type ?? ''),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
      data: item.data ?? item,
      section: typeof item.section === 'string' ? item.section : undefined
    }))
}

/**
 * 计算页面内容指纹（16 位十六进制）
 * @param page 页面字段
 * @param codeHashOf 取块当前代码指纹（未安装的块返回空串）
 */
export function computePageContentHash(
  page: HashablePage,
  codeHashOf: (blockKey: string) => string = () => ''
): string {
  const blocks = normalizeBlocks(page.blocks)
  const payload = {
    title: page.title ?? '',
    slug: page.slug ?? '',
    path: page.path ?? '',
    kind: page.kind ?? 'static',
    summary: page.summary ?? '',
    seoTitle: page.seoTitle ?? '',
    seoDescription: page.seoDescription ?? '',
    seoKeywords: page.seoKeywords ?? '',
    authorName: page.authorName ?? '',
    editorial: page.editorial ?? null,
    blocks: blocks.map((block) => ({
      id: block.id,
      key: block.key,
      enabled: block.enabled,
      data: block.data,
      section: block.section,
      codeHash: codeHashOf(block.key)
    }))
  }
  return createHash('sha1').update(stableStringify(payload)).digest('hex').slice(0, 16)
}

/** 计算块代码指纹 */
export function computeCodeHash(code: string): string {
  return createHash('sha1').update(code).digest('hex').slice(0, 16)
}

/** 取页面块实例（统一形态，供渲染与清单使用） */
export function normalizeBlockInstances(blocks: unknown): {
  id: string
  key: string
  enabled: boolean
  data: Record<string, unknown>
  section?: string
}[] {
  return normalizeBlocks(blocks).map((block) => ({
    id: block.id,
    key: block.key,
    enabled: block.enabled,
    data: (block.data as Record<string, unknown>) || {},
    section: block.section
  }))
}
