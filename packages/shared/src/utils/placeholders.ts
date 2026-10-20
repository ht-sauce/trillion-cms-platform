/**
 * GEO 文档变量占位符解析器
 * 依据 docs/spec/09-site-editor.md §10.3：支持 {{site.*}} / {{page.*}} / {{now:YYYY-MM-DD}}。
 * 仅在构建期 / 请求期解析（不落库），保证文档存的是模板、产物存的是最终值。
 */

/** 占位符作用域 */
export interface PlaceholderScope {
  /** 站点字段（可用点号路径取值，如 site.commonName） */
  site?: Record<string, unknown>
  /** 页面字段（如 page.title） */
  page?: Record<string, unknown>
  /** 基准时间，缺省为当前时间 */
  now?: Date
  /** 时区，缺省 Asia/Shanghai（与全站时间口径一致） */
  timeZone?: string
}

/** 匹配 {{site.a.b}} / {{page.a}} / {{now:YYYY-MM-DD}} */
const PLACEHOLDER_PATTERN = /\{\{\s*(site|page|now)\s*(?:\.([\w.]+)|:([^{}]+))?\s*\}\}/g

/** 取对象点号路径值 */
function pick(source: Record<string, unknown> | undefined, path: string): unknown {
  if (!source || !path) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

/** 值转字符串（对象/数组转 JSON，null/undefined 转空串） */
function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((item) => stringify(item)).join('、')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** 时区日期分量（用于 now 格式化） */
function dateParts(date: Date, timeZone: string): Record<string, string> {
  const parts: Record<string, string> = {}
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  for (const part of formatted.formatToParts(date)) parts[part.type] = part.value
  return parts
}

/**
 * 按 token 格式化日期
 * 支持 YYYY / YY / MM / M / DD / D / HH / mm / ss（其余字符原样输出）
 */
export function formatDateToken(date: Date, pattern: string, timeZone = 'Asia/Shanghai'): string {
  const parts = dateParts(date, timeZone)
  const tokens: Record<string, string> = {
    YYYY: parts.year ?? '0000',
    YY: (parts.year ?? '0000').slice(-2),
    MM: parts.month ?? '01',
    M: String(Number(parts.month ?? 1)),
    DD: parts.day ?? '01',
    D: String(Number(parts.day ?? 1)),
    HH: parts.hour ?? '00',
    mm: parts.minute ?? '00',
    ss: parts.second ?? '00'
  }
  return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|mm|ss/g, (token) => tokens[token] ?? token)
}

/**
 * 解析模板中的全部占位符
 * @param template 含占位符的文本
 * @param scope 变量作用域
 */
export function resolvePlaceholders(template: string, scope: PlaceholderScope = {}): string {
  if (!template) return ''
  const date = scope.now ?? new Date()
  const timeZone = scope.timeZone ?? 'Asia/Shanghai'

  return template.replace(PLACEHOLDER_PATTERN, (_match, kind: string, path: string, format: string) => {
    if (kind === 'now') return formatDateToken(date, format || 'YYYY-MM-DD', timeZone)
    if (kind === 'site') return stringify(pick(scope.site, path))
    return stringify(pick(scope.page, path))
  })
}

/**
 * GEO 文档双模式合成：auto_append = 自动内容 + 用户内容；override = 仅用户内容
 * @param auto 系统自动生成的内容
 * @param mode 双模式
 * @param custom 用户自定义内容
 */
export function composeGeoDoc(auto: string, mode: 'auto_append' | 'override', custom: string): string {
  if (mode === 'override') return custom.trim()
  const base = auto.trim()
  const extra = (custom || '').trim()
  if (!base) return extra
  if (!extra) return base
  return `${base}\n${extra}`
}

/** 模板中是否含占位符（后台提示「将按构建期变量解析」用） */
export function hasPlaceholders(template: string): boolean {
  return /\{\{\s*(site|page|now)\b/.test(template || '')
}
