/**
 * 新闻正文结构化块（ADR-053 / ADR-054）
 *
 * 新闻正文是「段落 / 小标题 / 图片 / 表格 / 视频」按顺序排列的块数组，存 `NewsArticle.body`（JSON）。
 * 块级仍然结构化（图文顺序、图片独立成块、表格独立成块），块内允许**受限的行内格式**：
 * 加粗 / 斜体 / 下划线 / 删除线 / 行内代码 / 换行，以及受控的 span 样式（文字色 / 背景色 / 字号）。
 * 摘要、检索、GEO 断言依旧只读 `text`（由 html 去标签派生），因此富文本不会污染结构化数据。
 *
 * 白名单收口（入参一律来自管理面，全部在这里过一遍）：
 * - kind 只认 paragraph / heading / image / table / video
 * - 行内只认 b / strong / i / em / u / s / del / code / br，span 仅保留 color / background-color / font-size
 * - 图片与视频地址只认站内静态轨（/static/、/assets/）或 http(s) 外链，data: / javascript: 一律丢弃
 * - 空文本块、无地址图片、无内容的表格直接丢掉
 *
 * **安全口径**：行内 html 的处理方式是「先整体转义，再把白名单标签还原」，顺序不能反——
 * 先还原再转义等于没做。属性一律丢弃（span 的 style 重新拼装，只保留白名单声明）。
 */
export type ArticleBlockKind = 'paragraph' | 'heading' | 'image' | 'table' | 'video'

/** 段落 / 小标题 / 表格单元格的对齐方式 */
export type ArticleAlign = 'left' | 'center' | 'right'

/** 单个正文块 */
export interface ArticleBlock {
  /** 块类型 */
  kind: ArticleBlockKind
  /** 段落 / 小标题纯文本（image / table / video 不用；由 html 去标签派生，GEO / 摘要 / 检索读它） */
  text?: string
  /** 段落 / 小标题的行内富文本（白名单标签，可直接 v-html；无格式时不写） */
  html?: string
  /** 段落 / 小标题 / 表格的对齐（缺省左对齐） */
  align?: ArticleAlign
  /** 图片地址（image 块必填；站内 /static/... 形态） */
  src?: string
  /** 图片替代文本（image 块；无说明时留空） */
  alt?: string
  /** 图片说明 / 视频说明（渲染为 figcaption） */
  caption?: string
  /** 小标题层级（heading 块，2~4，缺省 2） */
  level?: number
  /** 表格内容（table 块必填）：二维数组，单元格为白名单化后的行内 html */
  rows?: string[][]
  /** 表格首行是否为表头（table 块） */
  header?: boolean
  /** 视频封面（video 块，可选） */
  poster?: string
}

/** 图片说明 / 替代文本 / 视频说明上限 */
const CAPTION_MAX = 200
/** 单篇文章正文块上限（防御性上限，远超正常篇幅） */
const BLOCKS_MAX = 200
/** 单个块的行内 html 长度上限 */
const HTML_MAX = 8000
/** 表格：最多 30 行、8 列，单元格 1000 字 */
const TABLE_MAX_ROWS = 30
const TABLE_MAX_COLS = 8
const CELL_MAX = 1000

/** 小标题可用层级 */
const HEADING_LEVELS = [2, 3, 4]

/** 允许的图片 / 视频地址形态：站内静态轨或 http(s) 外链 */
const SRC_PATTERN = /^(\/static\/|\/assets\/|https?:\/\/)/i

/** 行内白名单标签（成对） */
const INLINE_TAGS = 'b|strong|i|em|u|s|del|code'

/** span 允许保留的样式声明 */
const SPAN_STYLE_KEYS = new Set(['color', 'background-color', 'font-size'])

/** 样式值白名单：#hex / rgb() / rgba() / Npx */
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i
const SIZE_VALUE = /^\d{1,2}(?:\.\d)?px$/i

/**
 * 校验 span 的 style：只保留 color / background-color / font-size 三类合法声明
 * @returns 规整后的 style 文本（空串表示整段样式都不可信）
 */
function sanitizeSpanStyle(raw: string): string {
  const kept: string[] = []
  for (const part of raw.split(';')) {
    const index = part.indexOf(':')
    if (index <= 0) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (!SPAN_STYLE_KEYS.has(key)) continue
    if (key === 'font-size' ? SIZE_VALUE.test(value) : COLOR_VALUE.test(value)) {
      kept.push(`${key}:${value}`)
    }
  }
  return kept.join(';')
}

/**
 * 行内 html 白名单化：**先整体转义，再把白名单标签还原**。
 * 这样任何标签属性、事件、脚本都只会以文字形式留下，不可能被浏览器执行；
 * 交换顺序（先还原再转义）才会出事，务必保持「先转义」。
 */
export function sanitizeInlineHtml(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  let html = input
    .slice(0, HTML_MAX)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  html = html.replace(new RegExp(`&lt;(\\/?)(${INLINE_TAGS})&gt;`, 'gi'), '<$1$2>')
  html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>')

  /** span：取出被转义过的 style 值，校验通过才还原成真标签 */
  const spanOpen = /&lt;span\s+style=&quot;([^&]*)&quot;&gt;/gi
  html = html.replace(spanOpen, (_match, style: string) => {
    const safe = sanitizeSpanStyle(style)
    return safe ? `<span style="${safe}">` : ''
  })
  /** 没有 style 的 span（wangEditor 偶尔产出）直接拆掉，只留文字 */
  html = html.replace(/&lt;span\s*&gt;/gi, '')
  /** 闭合标签按已开数量截断，避免出现无主的 </span> */
  const openCount = (html.match(/<span\b/gi) || []).length
  let closed = 0
  html = html.replace(/&lt;\/span&gt;/gi, () => {
    closed += 1
    return closed <= openCount ? '</span>' : ''
  })

  /** 去掉空标签（<b></b>、<i> </i>），避免存一堆无意义标记 */
  return html.replace(new RegExp(`<(${INLINE_TAGS})>\\s*<\\/\\1>`, 'gi'), '').trim()
}

/** 行内 html → 纯文本（解码实体、br 视为空格） */
export function inlineHtmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 文本规整：去首尾空白、压缩连续空白（正文段落内保留换行为空——一段一行） */
function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/** 对齐值收口 */
function readAlign(value: unknown): ArticleAlign | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined
}

/** 段落 / 小标题：白名单化 html 并派生纯文本；两者都空则返回 null（调用方丢弃该块） */
function readInlineBlock(item: Record<string, unknown>): { html: string; text: string } | null {
  const html = sanitizeInlineHtml(item.html)
  const text = html ? inlineHtmlToText(html) : cleanText(item.text)
  if (!text) return null
  /** 没有任何行内标记时不存 html，保持数据干净（纯文本块只用 text） */
  const keepHtml = /<[a-z][\s\S]*?>/i.test(html) ? html : ''
  return { html: keepHtml, text }
}

/** 表格：二维数组 → 清洗后的行（空行 / 空列裁掉，超限截断） */
function readTableRows(input: unknown): string[][] {
  if (!Array.isArray(input)) return []
  const rows: string[][] = []
  for (const rawRow of input.slice(0, TABLE_MAX_ROWS)) {
    if (!Array.isArray(rawRow)) continue
    const cells = rawRow.slice(0, TABLE_MAX_COLS).map((cell) => {
      const html = sanitizeInlineHtml(cell).slice(0, CELL_MAX)
      return /<[a-z]/i.test(html) ? html : cleanText(html)
    })
    /** 整行空则跳过（wangEditor 删行后可能留下空 tr） */
    if (cells.some((cell) => inlineHtmlToText(cell))) rows.push(cells)
  }
  return rows
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

    if (kind === 'video') {
      const src = typeof item.src === 'string' ? item.src.trim() : ''
      if (!SRC_PATTERN.test(src)) continue
      const block: ArticleBlock = { kind: 'video', src }
      const poster = typeof item.poster === 'string' ? item.poster.trim() : ''
      if (poster && SRC_PATTERN.test(poster)) block.poster = poster
      const caption = cleanText(item.caption).slice(0, CAPTION_MAX)
      if (caption) block.caption = caption
      blocks.push(block)
      continue
    }

    if (kind === 'table') {
      const rows = readTableRows(item.rows)
      if (!rows.length) continue
      const block: ArticleBlock = { kind: 'table', rows, header: item.header !== false }
      const align = readAlign(item.align)
      if (align) block.align = align
      blocks.push(block)
      continue
    }

    if (kind !== 'paragraph' && kind !== 'heading') continue
    const inline = readInlineBlock(item)
    if (!inline) continue
    const base: ArticleBlock = { kind, text: inline.text }
    if (inline.html) base.html = inline.html
    const align = readAlign(item.align)
    if (align) base.align = align
    if (kind === 'heading') {
      const level = Number(item.level)
      blocks.push({ ...base, level: HEADING_LEVELS.includes(level) ? level : 2 })
    } else {
      blocks.push(base)
    }
  }
  return blocks
}

/** 正文块的段落文本（按行拼接）：摘要缺省值、meta description、GEO 取文复用；表格按行拼进来 */
export function articleBlocksToText(blocks: ArticleBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'table') {
        return (block.rows || [])
          .map((row) => row.map((cell) => inlineHtmlToText(cell)).filter(Boolean).join(' '))
          .filter(Boolean)
          .join('\n')
      }
      if (block.kind === 'image' || block.kind === 'video') return ''
      return block.text || ''
    })
    .filter(Boolean)
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
