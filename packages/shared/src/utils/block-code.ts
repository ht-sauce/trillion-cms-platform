/**
 * 块代码（Vue SFC）工具：服务端编译校验与渲染引擎构建期改写共用同一套实现
 *
 * 为什么放在共享包：块声明（`defineBlock({...})`）的抽取与剥离逻辑必须两端一致，
 * 否则「服务端校验通过的代码」与「渲染引擎实际执行的代码」会出现语义偏差
 * （见 docs/spec/09-site-editor.md §4.2）。
 */
import type { BlockDeclaration, BlockFieldItemSchema, BlockFieldSchema } from '../types/editor.js'

/** 块 key 白名单正则：小写字母开头，允许字母/数字/连字符，长度 2~41 */
export const BLOCK_KEY_PATTERN = /^[a-z][a-z0-9-]{1,40}$/

/** 允许的字段类型（与 BlockFieldSchema.type 对应） */
export const BLOCK_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'switch',
  'select',
  'file',
  'url',
  'link',
  'list',
  'group'
] as const

/** key（kebab-case）→ PascalCase：hero-dark → HeroDark */
export function blockKeyToPascal(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')
}

/** key → 构建目录中的组件文件名：hero-dark → BlkHeroDark.vue */
export function blockFileName(key: string): string {
  return `Blk${blockKeyToPascal(key)}.vue`
}

/** 校验块 key 是否合法 */
export function isValidBlockKey(key: string): boolean {
  return BLOCK_KEY_PATTERN.test(key)
}

/** 提取结果：字面量文本 + 在源码中的起止下标（供剥离时替换） */
export interface DefineBlockLiteral {
  /** 对象字面量文本（含首尾花括号） */
  literal: string
  /** `defineBlock` 标识符起始下标 */
  callStart: number
  /** 调用右括号之后的下标（半开区间，含右括号） */
  callEnd: number
}

/**
 * 从源码中定位 `defineBlock({...})` 调用
 *
 * 做括号配对时跳过字符串（单/双引号/模板串）、行注释与块注释，
 * 因此声明里出现 `'}'`、`"//"` 等字符不会被误判为结构符。
 * 返回 null 表示未找到合法调用。
 */
export function findDefineBlockCall(source: string): DefineBlockLiteral | null {
  const match = /\bdefineBlock\s*\(/.exec(source)
  if (!match) return null

  const callStart = match.index
  const openParen = source.indexOf('(', match.index)
  if (openParen < 0) return null

  // 跳过 `(` 之后的空白，要求紧接着就是对象字面量起始花括号
  let cursor = openParen + 1
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1
  if (source[cursor] !== '{') return null

  const literalStart = cursor
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = literalStart; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (escaped) {
      escaped = false
      continue
    }
    if (inSingle || inDouble || inTemplate) {
      if (char === '\\') {
        escaped = true
        continue
      }
      if (inSingle && char === "'") inSingle = false
      else if (inDouble && char === '"') inDouble = false
      else if (inTemplate && char === '`') inTemplate = false
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '"') {
      inDouble = true
      continue
    }
    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        // 定位闭合右括号（`}` 之后允许空白，然后是 `)`）
        let close = i + 1
        while (close < source.length && /\s/.test(source[close])) close += 1
        if (source[close] !== ')') return null
        return {
          literal: source.slice(literalStart, i + 1),
          callStart,
          callEnd: close + 1
        }
      }
    }
  }
  return null
}

/** 兼容旧名：只需字面量文本时使用 */
export function extractDefineBlockLiteral(source: string): string | null {
  return findDefineBlockCall(source)?.literal ?? null
}

/**
 * 剥离 `defineBlock({...})` 调用，替换为 `void 0`
 *
 * 渲染引擎构建期需要执行块代码，但 `defineBlock` 只是「声明标记」——
 * 它在浏览器/SSR 环境里没有定义，直接执行会抛 ReferenceError。
 * 这里把它原地替换为空表达式，既保留行列结构（报错行号不漂移），又不引入运行时全局。
 */
export function stripDefineBlockCall(source: string): string {
  const found = findDefineBlockCall(source)
  if (!found) return source
  return `${source.slice(0, found.callStart)}void 0${source.slice(found.callEnd)}`
}

/** 规整字段子结构（list 子项 / group 子字段），丢弃非法结构 */
export function normalizeFieldItem(input: unknown): BlockFieldItemSchema | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type : ''
  if (!BLOCK_FIELD_TYPES.includes(type as (typeof BLOCK_FIELD_TYPES)[number])) return undefined

  const item: BlockFieldItemSchema = { type: type as BlockFieldItemSchema['type'] }
  if (Array.isArray(raw.fields)) item.fields = normalizeBlockFields(raw.fields)
  if (raw.item) item.item = normalizeFieldItem(raw.item)
  if (Array.isArray(raw.options)) item.options = raw.options.filter((v): v is string => typeof v === 'string')
  return item
}

/** 规整字段声明数组：丢弃结构非法的字段，保证后台表单不会因脏声明崩溃 */
export function normalizeBlockFields(input: unknown): BlockFieldSchema[] {
  if (!Array.isArray(input)) return []
  const result: BlockFieldSchema[] = []

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const key = typeof item.key === 'string' ? item.key : ''
    const type = typeof item.type === 'string' ? item.type : ''
    if (!key || !BLOCK_FIELD_TYPES.includes(type as (typeof BLOCK_FIELD_TYPES)[number])) continue

    const field: BlockFieldSchema = {
      key,
      label: typeof item.label === 'string' && item.label ? item.label : key,
      type: type as BlockFieldSchema['type'],
      required: Boolean(item.required)
    }
    if (typeof item.hint === 'string') field.hint = item.hint
    if (Array.isArray(item.options)) field.options = item.options.filter((v): v is string => typeof v === 'string')
    /**
     * `group` 的子字段直接挂在 `fields` 上（如 article-body 的 sidebarEditorial:
     * `{ type: 'group', fields: [writer, reviewer, ...] }`），必须原样保留 ——
     * 后台数据表单靠它渲染分组内的输入项，丢了会退化成一个没有任何输入的空分组。
     * 声明契约里 group 与 list 共用 `item` 通道，故这里包一层 group 子项。
     */
    if (type === 'group') {
      field.item = { type: 'group', fields: normalizeBlockFields(item.fields) }
    } else {
      const sub = normalizeFieldItem(item.item)
      if (sub) field.item = sub
    }
    if (item.default !== undefined) field.default = item.default
    result.push(field)
  }
  return result
}

/** 规整 defineBlock 声明对象 */
export function normalizeBlockDeclaration(raw: Record<string, unknown>): BlockDeclaration {
  const source = (raw.dataSource ?? {}) as Record<string, unknown>
  const dataSource =
    source.kind === 'childPages' && typeof source.channelSlug === 'string'
      ? { kind: 'childPages' as const, channelSlug: source.channelSlug }
      : { kind: 'manual' as const }

  return {
    key: String(raw.key ?? ''),
    name: String(raw.name ?? ''),
    hint: typeof raw.hint === 'string' ? raw.hint : '',
    fields: normalizeBlockFields(raw.fields),
    dataSource
  }
}

/**
 * 从块源码中解析 `defineBlock` 声明（不求值任意代码，仅求值已配对的对象字面量）
 * 返回 null 表示未找到声明
 */
export function parseDefineBlockDeclaration(source: string): BlockDeclaration | null {
  const literal = extractDefineBlockLiteral(source)
  if (!literal) return null
  try {
    const raw = new Function(`"use strict";return (${literal})`)() as Record<string, unknown>
    return normalizeBlockDeclaration(raw)
  } catch {
    return null
  }
}
