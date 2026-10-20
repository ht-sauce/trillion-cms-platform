/**
 * head 扩展解析（09 §10.3）
 *
 * 服务端把用户填的 head 扩展**净化后**随站点档案返回（只允许 meta / link，
 * 已剔除 script、事件属性与 javascript: 协议）。本文件把它解析成 unhead 需要的结构化对象。
 *
 * 为什么不直接 innerHTML 注入：unhead 只接受结构化输入，
 * 而且结构化注入能在 SSR 输出时保证标签顺序与属性转义正确。
 */

/** 解析出的 head 标签（meta / link） */
export interface HeadTag {
  kind: 'meta' | 'link'
  attrs: Record<string, string>
}

/**
 * 解析 head 扩展文本
 * 只认 `<meta ...>` 与 `<link ...>`；其余一律忽略（服务端已净化，这里是二次兜底）
 */
export function parseHeadExtra(input: string | null | undefined): HeadTag[] {
  if (!input) return []
  const tags: HeadTag[] = []
  const pattern = /<(meta|link)\b([^>]*)>/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    const kind = match[1].toLowerCase() as 'meta' | 'link'
    const attrs: Record<string, string> = {}
    const attrPattern = /([a-z-]+)\s*=\s*"([^"]*)"/gi
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrPattern.exec(match[2] || '')) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2]
    }
    /** 至少要有一个有效属性，且 meta 必须有 name/property */
    if (!Object.keys(attrs).length) continue
    if (kind === 'meta' && !attrs.name && !attrs.property) continue
    if (kind === 'link' && !attrs.rel) continue
    tags.push({ kind, attrs })
  }
  return tags
}

/** 转成 useHead 需要的分组结构 */
export function toHeadGroups(tags: HeadTag[]): {
  meta: Record<string, string>[]
  link: Record<string, string>[]
} {
  return {
    meta: tags.filter((tag) => tag.kind === 'meta').map((tag) => tag.attrs),
    link: tags.filter((tag) => tag.kind === 'link').map((tag) => tag.attrs)
  }
}
