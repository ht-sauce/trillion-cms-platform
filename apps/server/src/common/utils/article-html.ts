/**
 * 正文整篇 HTML 白名单化（ADR-060；ADR-061 起仅采集 / 导入使用）
 *
 * 正文主数据是整篇 HTML（新闻 `NewsArticle.bodyHtml` / 案例 `CaseStudy.bodyHtml`）。
 * **管理端保存与站点渲染均原样输出、不做清洗（ADR-061）**；本工具只在采集 / 导入脚本
 * 写库前做入库整理，避免把外部站点的脚本或事件属性带进来。
 *
 * 收口方式（与 ADR-053 的块白名单同一安全口径，只是作用在整篇 HTML 上）：
 * - **标签白名单**：p / br / h2~h4 / b / strong / i / em / u / s / del / code / blockquote /
 *   ul / ol / li / a / figure / figcaption / img / table / thead / tbody / tr / th / td /
 *   video / div / section / span。`h1` 一律降级为 `h2`（页面唯一 H1 由页面标题承担，GEO 硬约束），
 *   `h5`/`h6` 降级为 `h4`；`script` / `style` 整块丢弃（含其内容）；注释丢弃。
 * - **属性白名单**：img 只留 src/alt/width/height，a 只留 href/title，video 只留 src/poster/controls，
 *   其余标签只留 `style`（其它属性包括事件属性一律丢弃）。
 * - **style 按键值白名单解析**：只保留排版相关的键，值不匹配正则即丢弃该条声明；
 *   `position` / `top` / `left` / `z-index` / `transform` 等可制造浮层与遮挡的键不在白名单内。
 * - **地址白名单**：图片 / 视频只认站内静态轨（`/static/`、`/assets/`）或 `http(s)`；
 *   `data:` / `javascript:` 一律丢弃；a 的 href 额外允许站内相对路径与 `#` 锚点。
 *
 * 结构平衡：所有输出标签都走栈，未匹配的结束标签与未闭合的开始标签在收尾时补齐，
 * 避免半开口标签把页面后续内容吞掉。
 */

/** 单篇正文 HTML 上限（防御性上限，远超正常篇幅） */
const HTML_MAX = 200_000
/** 单条 style 上限 */
const STYLE_MAX = 4_000
/** style 值最长长度 */
const STYLE_VALUE_MAX = 120

/** 允许输出的标签 */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'code',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'figure',
  'figcaption',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'video',
  'source',
  'div',
  'section',
  'span'
])

/** 标签降级：h1 → h2（唯一 H1 留给页面标题）、h5/h6 → h4 */
const TAG_ALIAS: Record<string, string> = { h1: 'h2', h5: 'h4', h6: 'h4' }

/** 自闭合（void）标签 */
const VOID_TAGS = new Set(['br', 'img', 'source'])

/** 各标签允许的非 style 属性 */
const TAG_ATTRS: Record<string, Set<string>> = {
  img: new Set(['src', 'alt', 'width', 'height']),
  a: new Set(['href', 'title']),
  video: new Set(['src', 'poster', 'controls', 'width', 'height']),
  source: new Set(['src', 'type']),
  table: new Set(['border', 'width', 'height', 'cellpadding', 'cellspacing']),
  th: new Set(['colspan', 'rowspan', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'width', 'height'])
}

/** style 白名单键 */
const STYLE_KEYS = new Set([
  'text-align',
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'display',
  'grid-template-columns',
  'gap',
  'row-gap',
  'column-gap',
  'flex',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'float',
  'clear',
  'object-fit',
  'aspect-ratio',
  'vertical-align',
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'text-decoration',
  'border-radius',
  'border',
  'border-color',
  'opacity'
])

/** 长度 / 距离类值（px / % / em / rem / vw / vh / auto） */
const SIZE_VALUE = /^(auto|0|(?:\d{1,4}(?:\.\d{1,2})?)(?:px|%|em|rem|vw|vh))$/i
/** 颜色值 */
const COLOR_VALUE =
  /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i
/** display 取值 */
const DISPLAY_VALUE = /^(block|inline-block|inline|flex|inline-flex|grid|none|table|table-cell)$/i
/** 布局类的通用值（只含安全字符） */
const LAYOUT_VALUE = /^[a-z0-9 %.,/()\-]+$/i
/** 数值（font-weight / opacity / line-height） */
const NUMBER_VALUE = /^(?:normal|bold|bolder|lighter|\d{1,3}|0?\.\d{1,2}|\d{1,2}(?:\.\d{1,2})?)$/i

/** 站内静态轨或 http(s) 外链 */
const SRC_PATTERN = /^(\/static\/|\/assets\/|https?:\/\/)/i
/** 超链接：站内静态轨 / 站内相对路径 / 锚点 / http(s) */
const HREF_PATTERN = /^(\/static\/|\/assets\/|\/|#|https?:\/\/)/i

/** HTML 文本转义 */
function escapeText(text: string, preserveEntities = false): string {
  return text
    .replace(preserveEntities ? /&(?!(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);)/gi : /&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 属性值转义（双引号包裹） */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeAttr(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) return named[name.toLowerCase()]
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity
  })
}

/** 从 `<` 起始位置找到标签结束的 `>`（跳过引号内的 `>`） */
function findTagEnd(source: string, start: number): number {
  let quote = ''
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

/** 解析标签内的属性串为 [name, value] 列表（name 一律小写） */
function parseAttrs(raw: string): [string, string][] {
  const attrs: [string, string][] = []
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attrs.push([name, decodeAttr(value)])
  }
  return attrs
}

/** style 白名单化：逐条声明校验键与值，返回规整后的 style 文本 */
function sanitizeStyle(raw: string): string {
  const kept: string[] = []
  for (const part of String(raw ?? '')
    .slice(0, STYLE_MAX)
    .split(';')) {
    const index = part.indexOf(':')
    if (index <= 0) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part
      .slice(index + 1)
      .trim()
      .replace(/\s*!important$/i, '')
    if (!STYLE_KEYS.has(key) || !value || value.length > STYLE_VALUE_MAX) continue

    let ok = false
    if (key === 'color' || key === 'background-color' || key === 'border-color') ok = COLOR_VALUE.test(value)
    else if (key === 'display') ok = DISPLAY_VALUE.test(value)
    else if (key === 'font-weight' || key === 'opacity') ok = NUMBER_VALUE.test(value)
    else if (key === 'line-height' || key === 'font-size') ok = SIZE_VALUE.test(value) || /^0?\.\d{1,2}$/.test(value)
    else if (
      key === 'width' ||
      key === 'max-width' ||
      key === 'min-width' ||
      key === 'height' ||
      key === 'max-height'
    ) {
      ok = SIZE_VALUE.test(value)
    } else if (
      key.startsWith('margin') ||
      key.startsWith('padding') ||
      key === 'gap' ||
      key === 'row-gap' ||
      key === 'column-gap'
    ) {
      ok = value.split(/\s+/).every((item) => SIZE_VALUE.test(item))
    } else if (
      key === 'text-align' ||
      key === 'float' ||
      key === 'clear' ||
      key === 'font-style' ||
      key === 'text-decoration' ||
      key === 'object-fit' ||
      key === 'vertical-align' ||
      key === 'border-radius' ||
      key === 'border'
    ) {
      ok = LAYOUT_VALUE.test(value)
    } else {
      ok = LAYOUT_VALUE.test(value)
    }
    if (ok) kept.push(`${key}:${value}`)
  }
  return kept.join(';')
}

/** 地址白名单：非法形态返回空串 */
function safeUrl(value: string, kind: 'src' | 'href'): string {
  const url = String(value ?? '').trim()
  if (!url) return ''
  if (/^(data|javascript|vbscript):/i.test(url)) return ''
  return (kind === 'src' ? SRC_PATTERN : HREF_PATTERN).test(url) ? url : ''
}

/** 单个开始标签 → 白名单化后的输出（返回空串表示整标签丢弃） */
function buildOpenTag(rawName: string, rawAttrs: string): { tag: string; html: string } | null {
  const name = TAG_ALIAS[rawName] ?? rawName
  if (!ALLOWED_TAGS.has(name)) return null

  const allowed = TAG_ATTRS[name]
  const parts: string[] = []
  for (const [attr, value] of parseAttrs(rawAttrs)) {
    if (attr === 'data-w-e-type') {
      if (
        (name === 'div' && value === 'video') ||
        (name === 'img' && value === 'image') ||
        (name === 'table' && value === 'table')
      )
        parts.push(`${attr}="${value}"`)
      continue
    }
    if (attr === 'data-w-e-is-void' || attr === 'data-w-e-is-inline') {
      if ((value === '' || value === 'true') && (name === 'img' || (name === 'div' && attr === 'data-w-e-is-void'))) {
        parts.push(attr)
      }
      continue
    }
    if (attr === 'style') {
      const style = sanitizeStyle(value)
      if (style) parts.push(`style="${escapeAttr(style)}"`)
      continue
    }
    if (!allowed?.has(attr)) continue
    if (attr === 'src' || attr === 'poster') {
      const url = safeUrl(value, 'src')
      if (url) parts.push(`${attr}="${escapeAttr(url)}"`)
      continue
    }
    if (attr === 'href') {
      const url = safeUrl(value, 'href')
      if (url) parts.push(`href="${escapeAttr(url)}"`)
      continue
    }
    if (attr === 'width' || attr === 'height') {
      if (/^\d{1,5}$/.test(value) || (name !== 'img' && /^(auto|\d{1,3}%)$/.test(value))) {
        parts.push(`${attr}="${value}"`)
      }
      continue
    }
    if (attr === 'colspan' || attr === 'rowspan') {
      if (/^[1-9]\d{0,3}$/.test(value)) parts.push(`${attr}="${value}"`)
      continue
    }
    if (attr === 'border' || attr === 'cellpadding' || attr === 'cellspacing') {
      if (/^\d{1,4}$/.test(value)) parts.push(`${attr}="${value}"`)
      continue
    }
    if (attr === 'type') {
      if (/^video\/(mp4|webm|ogg)$/i.test(value)) parts.push(`type="${value}"`)
      continue
    }
    if (attr === 'controls') {
      parts.push('controls')
      continue
    }
    if (attr === 'alt' || attr === 'title') {
      parts.push(`${attr}="${escapeAttr(value.slice(0, 200))}"`)
    }
  }
  return { tag: name, html: `<${name}${parts.length ? ` ${parts.join(' ')}` : ''}>` }
}

/**
 * 整篇 HTML 白名单化（唯一信任边界）
 * @param input 管理端 / 采集脚本 / 历史数据传来的任意值
 */
export function sanitizeArticleHtml(input: unknown): string {
  const source = typeof input === 'string' ? input.slice(0, HTML_MAX) : ''
  if (!source.trim()) return ''

  const out: string[] = []
  const stack: string[] = []
  let index = 0

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt < 0) {
      out.push(escapeText(source.slice(index), true))
      break
    }
    if (lt > index) out.push(escapeText(source.slice(index, lt), true))

    /** 注释整段丢弃 */
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      index = end < 0 ? source.length : end + 3
      continue
    }

    const gt = findTagEnd(source, lt + 1)
    if (gt < 0) {
      out.push(escapeText(source.slice(lt), true))
      break
    }
    const raw = source.slice(lt + 1, gt).trim()
    index = gt + 1

    /** 结束标签 */
    if (raw.startsWith('/')) {
      const name = TAG_ALIAS[raw.slice(1).trim().toLowerCase()] ?? raw.slice(1).trim().toLowerCase()
      const at = stack.lastIndexOf(name)
      if (at >= 0) {
        /** 弹出该标签之上的所有未闭合标签（保证结构平衡） */
        while (stack.length > at) {
          const closing = stack.pop() as string
          out.push(`</${closing}>`)
        }
      }
      continue
    }

    /** script / style 整块丢弃（含内容） */
    const blocked = /^(script|style)\b/i.exec(raw)
    if (blocked) {
      const close = source.toLowerCase().indexOf(`</${blocked[1].toLowerCase()}`, index)
      index = close < 0 ? source.length : source.indexOf('>', close) + 1 || source.length
      continue
    }

    const nameMatch = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(raw)
    if (!nameMatch) continue
    const built = buildOpenTag(nameMatch[1].toLowerCase(), raw.slice(nameMatch[0].length))
    if (!built) continue

    out.push(built.html)
    if (!VOID_TAGS.has(built.tag)) stack.push(built.tag)
  }

  /** 收尾补齐未闭合标签 */
  while (stack.length) out.push(`</${stack.pop() as string}>`)

  return out.join('').trim()
}

/** 块级标签：取文时视为换行 */
const BLOCK_TAGS = /<\/?(p|div|section|h[1-6]|li|tr|table|thead|tbody|blockquote|figure|figcaption)\b[^>]*>/gi

/**
 * 整篇 HTML → 纯文本（摘要缺省值、meta description、检索、GEO 取文复用）
 * @param html 已白名单化或任意 HTML
 */
export function htmlToText(html: unknown): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * 历史块数组 → 整篇 HTML（存量迁移用）
 * 段落 / 小标题带 `html` 时原样嵌入，否则转义纯文本；图片渲染为 figure + figcaption。
 */
export function articleBlocksToHtml(
  blocks: {
    kind?: string
    text?: string
    html?: string
    align?: string
    level?: number
    src?: string
    alt?: string
    caption?: string
    poster?: string
    rows?: string[][]
    header?: boolean
  }[]
): string {
  const list = Array.isArray(blocks) ? blocks : []
  return list
    .map((block) => {
      const kind = String(block.kind ?? 'paragraph')
      const align = block.align ? ` style="text-align:${block.align}"` : ''
      const inline = block.html || escapeText(String(block.text ?? ''))
      if (kind === 'image') {
        if (!block.src) return ''
        const alt = block.alt ? ` alt="${escapeAttr(block.alt)}"` : ''
        const caption = block.caption ? `<figcaption>${escapeText(block.caption)}</figcaption>` : ''
        return `<figure><img src="${escapeAttr(block.src)}"${alt}>${caption}</figure>`
      }
      if (kind === 'video') {
        if (!block.src) return ''
        const poster = block.poster ? ` poster="${escapeAttr(block.poster)}"` : ''
        const caption = block.caption ? `<figcaption>${escapeText(block.caption)}</figcaption>` : ''
        return `<figure><video src="${escapeAttr(block.src)}"${poster} controls></video>${caption}</figure>`
      }
      if (kind === 'table') {
        const rows = Array.isArray(block.rows) ? block.rows : []
        if (!rows.length) return ''
        const head = block.header === false ? [] : [rows[0]]
        const body = block.header === false ? rows : rows.slice(1)
        const headHtml = head.map((row) => `<tr>${row.map((cell) => `<th>${cell}</th>`).join('')}</tr>`).join('')
        const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
        return `<table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`
      }
      if (kind === 'rich') return inline || ''
      if (!inline.trim()) return ''
      if (kind === 'heading') {
        const level = Math.min(4, Math.max(2, Number(block.level) || 2))
        return `<h${level}${align}>${inline}</h${level}>`
      }
      return `<p${align}>${inline}</p>`
    })
    .filter(Boolean)
    .join('')
}
