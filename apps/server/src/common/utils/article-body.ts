/**
 * 新闻正文结构化块（ADR-053）
 *
 * 新闻正文是「段落 / 小标题 / 图片」按顺序排列的块数组，存 `NewsArticle.body`（JSON）。
 * 不用富文本 HTML：块数组既能保留图片与图片说明，又能让摘要、检索、GEO 断言直接取纯文本，
 * 与「结构化内容优先」的总体路线一致（见 docs/spec/00-overview.md P5）。
 *
 * 入参来自管理面，一律在这里做白名单收口：
 * - kind 只认 paragraph / heading / image
 * - 图片地址只认站内静态轨（/static/、/assets/）或 http(s) 外链，data: / javascript: 一律丢弃
 * - 空文本块、无地址图片块直接丢掉（避免发布出空段落）
 */
export type ArticleBlockKind = 'paragraph' | 'heading' | 'image'

/** 单个正文块 */
export interface ArticleBlock {
  /** 块类型 */
  kind: ArticleBlockKind
  /** 段落 / 小标题文本（image 块不用） */
  text?: string
  /** 图片地址（image 块必填；站内 /static/... 形态） */
  src?: string
  /** 图片替代文本（image 块；无说明时留空） */
  alt?: string
  /** 图片说明（image 块；渲染为 figcaption） */
  caption?: string
  /** 小标题层级（heading 块，2~4，缺省 2） */
  level?: number
}

/** 图片说明 / 替代文本上限（与 block 编辑器文本字段口径一致） */
const CAPTION_MAX = 200
/** 单篇文章正文块上限（防御性上限，远超正常篇幅） */
const BLOCKS_MAX = 200

/** 小标题可用层级 */
const HEADING_LEVELS = [2, 3, 4]

/** 允许的图片地址形态：站内静态轨或 http(s) 外链 */
const SRC_PATTERN = /^(\/static\/|\/assets\/|https?:\/\/)/i

/** 文本规整：去首尾空白、压缩连续空白（正文段落内保留换行为空——一段一行） */
function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/**
 * 管理面入参 → 规范化的正文块数组
 * @param input DTO 传来的任意值（可空；历史数据为 null）
 */
export function normalizeArticleBody(input: unknown): ArticleBlock[] {
  if (!Array.isArray(input)) return []
  const blocks: ArticleBlock[] = []
  for (const raw of input.slice(0, BLOCKS_MAX)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const kind = item.kind
    if (kind === 'image') {
      const src = typeof item.src === 'string' ? item.src.trim() : ''
      if (!SRC_PATTERN.test(src)) continue
      const block: ArticleBlock = { kind: 'image', src }
      const alt = cleanText(item.alt).slice(0, CAPTION_MAX)
      const caption = cleanText(item.caption).slice(0, CAPTION_MAX)
      if (alt) block.alt = alt
      if (caption) block.caption = caption
      blocks.push(block)
      continue
    }
    if (kind !== 'paragraph' && kind !== 'heading') continue
    const text = cleanText(item.text)
    if (!text) continue
    if (kind === 'heading') {
      const level = Number(item.level)
      blocks.push({ kind, text, level: HEADING_LEVELS.includes(level) ? level : 2 })
    } else {
      blocks.push({ kind, text })
    }
  }
  return blocks
}

/** 正文块的段落文本（按行拼接）：摘要缺省值、meta description、GEO 取文复用 */
export function articleBlocksToText(blocks: ArticleBlock[]): string {
  return blocks
    .filter((block) => block.kind !== 'image' && block.text)
    .map((block) => block.text as string)
    .join('\n')
}

/**
 * 发布用正文块：有结构化 body 用它，否则把纯文本按段落拆成块（历史数据回落路径）
 * @param body 表里的 body（已规范化或历史 null）
 * @param paragraphs 纯文本段落（splitParagraphs 结果）
 */
export function resolveArticleBlocks(body: ArticleBlock[] | null, paragraphs: string[]): ArticleBlock[] {
  return body && body.length ? body : paragraphs.map((text) => ({ kind: 'paragraph' as const, text }))
}
