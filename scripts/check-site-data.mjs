/**
 * 建站描述契约校验器
 *
 * 为什么需要它：页面块数据（`data`）与块代码里的 `defineBlock({ fields })` 声明是两份东西，
 * 靠人眼对齐必然漂移——字段名写错的结果是「后台表单读不到这个字段」，页面上却静默少一块内容。
 * 本脚本把「块 SFC 声明」当唯一事实来源，逐页逐块比对键名与必填项，把漂移变成一次构建前的硬错误。
 *
 * 校验深度：**递归**。块声明里的 `list` / `group` 会嵌套子字段（如 `case-card.items[].caseId`、
 * `article-body.blocks[].kind`），只比顶层等于没比——曾出现正文块把 `kind` 写成 `type`、
 * 校验器却放行的事故。因此 list 的每个元素、group 的每个子字段都会带上定位路径逐一比对。
 *
 * 用法：node scripts/check-site-data.mjs <描述文件路径>
 *   描述文件路径**必填**（不提供缺省值）
 *   退出码：0 通过（或仅有警告） / 1 存在阻断问题
 *
 * 阻断：未知字段、必填项为空、块定义缺失、H1 唯一性
 * 警告：select 取值不在 options 内、number/switch 类型不匹配、块未被使用、页面无块实例
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDefineBlockDeclaration, extractDefineBlockLiteral } from '../packages/shared/dist/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const blocksDir = path.join(root, 'apps', 'server', 'prisma', 'blocks')
/** 命令行：以 -- 开头的都算开关，第一个非开关参数才是描述文件路径 */
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const dataArg = args.find((arg) => !arg.startsWith('--'))
if (!dataArg) {
  console.error('[check] 必须指定建站描述 JSON 路径：node scripts/check-site-data.mjs <描述文件路径>')
  process.exit(1)
}
const dataPath = path.resolve(root, dataArg)

if (!fs.existsSync(dataPath)) {
  console.error(`[check] 描述文件不存在：${dataPath}`)
  process.exit(1)
}

/**
 * 从 SFC 源码重读完整字段树
 *
 * 为什么不用 `parseDefineBlockDeclaration().fields`：`normalizeBlockFields` 只保留 `item`，
 * 遇到 `type: 'group'` 的字段会丢掉它的 `fields`（`article-body.sidebarEditorial` 就是受害者），
 * 递归校验会把它内部所有键误判为未知字段。这里自行规整，group 的 `fields` 一并保留。
 * 解析失败时返回 null，调用方回退到 shared 的解析结果。
 */
function readFieldTree(source) {
  const literal = extractDefineBlockLiteral(source)
  if (!literal) return null
  let raw
  try {
    // eslint-disable-next-line no-new-func
    raw = new Function(`"use strict";return (${literal})`)()
  } catch {
    return null
  }
  if (!raw || !Array.isArray(raw.fields)) return null
  return raw.fields.map(toNode).filter(Boolean)
}

/** 把一个原始字段声明规整成校验用的节点（对 group / list / list 内嵌 list 都成立） */
function toNode(input) {
  if (!input || typeof input !== 'object') return null
  const key = typeof input.key === 'string' ? input.key : ''
  const type = typeof input.type === 'string' ? input.type : 'text'
  const node = {
    key,
    type,
    required: Boolean(input.required),
    options: Array.isArray(input.options) ? input.options.filter((v) => typeof v === 'string') : []
  }
  if (Array.isArray(input.fields)) {
    const fields = input.fields.map(toNode).filter(Boolean)
    if (fields.length) node.fields = fields
  }
  if (input.item && typeof input.item === 'object') {
    const sub = toNode(input.item)
    if (sub) node.item = sub
  }
  return node
}

/** 块声明表：key → { declaration, fields }（来源 = 落地的 SFC，与后台块库同源） */
const declarations = new Map()
for (const file of fs.readdirSync(blocksDir).sort()) {
  if (!file.endsWith('.vue')) continue
  const source = fs.readFileSync(path.join(blocksDir, file), 'utf8')
  const parsed = parseDefineBlockDeclaration(source)
  if (!parsed?.key) {
    console.error(`[check] ${file} 未解析出 defineBlock 声明`)
    process.exit(1)
  }
  declarations.set(parsed.key, {
    declaration: parsed,
    fields: readFieldTree(source) ?? parsed.fields ?? []
  })
}

/**
 * `--dump-fields`：只打印块字段清单而不做校验
 * 用途：写块数据时先拿到「字段名权威表」。BLOCKS.md 是设计意图稿，落地字段名以 SFC 声明为准，
 * 以清单为准可以避免写完再返工。
 */
if (flags.has('--dump-fields')) {
  for (const [key, declaration] of declarations) {
    console.log(`\n${key}  (${declaration.name})`)
    const walk = (fields, indent) => {
      for (const field of fields ?? []) {
        const options = field.options ? ` [${field.options.join('|')}]` : ''
        console.log(`${indent}${field.key}:${field.type}${field.required ? '*' : ''}${options}`)
        if (field.item?.fields) walk(field.item.fields, `${indent}    `)
      }
    }
    walk(declaration.fields, '  ')
  }
  process.exit(0)
}

const doc = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const errors = []
const warnings = []

/** 缺失 / 空值判定：空数组也算没填，避免「有容器没内容」蒙混过关 */
function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
}

/** 校验一个对象（块 data、list 元素、group 值）的键名与必填，并递归子字段 */
function checkObject(fields, data, at) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`${at}：应为对象，实为 ${Array.isArray(data) ? '数组' : typeof data}`)
    return
  }
  const allowed = fields.map((field) => field.key)
  for (const [key, value] of Object.entries(data)) {
    const field = fields.find((item) => item.key === key)
    if (!field) {
      errors.push(`${at}：字段 "${key}" 不在块声明里（声明字段：${allowed.join(', ')}）`)
      continue
    }
    checkField(field, value, `${at}.${key}`)
  }
  for (const field of fields) {
    if (field.required && isEmpty(data[field.key])) {
      errors.push(`${at}：必填字段 "${field.key}" 为空`)
    }
  }
}

/** 校验单个字段的取值形态 */
function checkField(field, value, at) {
  if (value === undefined || value === null) return

  switch (field.type) {
    case 'list': {
      if (!Array.isArray(value)) {
        errors.push(`${at}：应为数组，实为 ${typeof value}`)
        return
      }
      const item = field.item
      value.forEach((element, index) => {
        const where = `${at}[${index}]`
        if (item?.fields?.length) {
          checkObject(item.fields, element, where)
        } else if (item?.type === 'list') {
          // 二维数组（如 data-table.rows）：元素本身应是一行单元格数组
          if (!Array.isArray(element)) errors.push(`${where}：应为数组，实为 ${typeof element}`)
        }
      })
      return
    }
    case 'group': {
      // 声明缺 fields（理论上不会，兜底）时不误报
      if (field.fields?.length) checkObject(field.fields, value, at)
      return
    }
    case 'select': {
      if (field.options.length && !field.options.includes(String(value))) {
        warnings.push(`${at}：取值 "${value}" 不在选项（${field.options.join(' / ')}）内`)
      }
      return
    }
    case 'number': {
      if (typeof value !== 'number') warnings.push(`${at}：声明为 number，实为 ${typeof value}`)
      return
    }
    case 'switch': {
      if (typeof value !== 'boolean') warnings.push(`${at}：声明为 switch（布尔），实为 ${typeof value}`)
      return
    }
    default:
      return
  }
}

let blockCount = 0
for (const page of doc.pages ?? []) {
  const where = `${page.channelSlug}/${page.slug}`
  const blocks = page.blocks ?? []
  if (!blocks.length) {
    warnings.push(`${where}：页面没有任何块实例`)
    continue
  }

  /**
   * 全页唯一 H1：块层只有 hero-dark 会渲染 h1；页面没有 hero-dark 时由 PageRender
   * 用 page.title 兜底渲染一次（`hasHeroBlock()` 判据）。因此这里的硬约束是
   * 「同一页至多一个 hero-dark」，而不是「hero-dark 与 legal-doc 不能共存」
   * （legal-doc 的小节标题一律 h2，不产 H1）。
   */
  const heroes = blocks.filter((block) => block.key === 'hero-dark')
  if (heroes.length > 1) {
    errors.push(`${where}：出现 ${heroes.length} 个 hero-dark，会渲染出多个 H1`)
  }
  if (!heroes.length && !page.title) {
    errors.push(`${where}：既无 hero-dark 也无页面标题，渲染后页面没有 H1`)
  }

  for (const [index, block] of blocks.entries()) {
    blockCount += 1
    const at = `${where} [${index}] ${block.key}`
    const entry = declarations.get(block.key)
    if (!entry) {
      errors.push(`${at}：块定义不存在（块代码未入库）`)
      continue
    }
    checkObject(entry.fields, block.data ?? {}, at)
  }
}

const usedKeys = new Set((doc.pages ?? []).flatMap((page) => (page.blocks ?? []).map((block) => block.key)))
const unused = [...declarations.keys()].filter((key) => !usedKeys.has(key))
if (unused.length) warnings.push(`块库中有 ${unused.length} 个块未被任何页面使用：${unused.join(', ')}`)

console.log(
  `[check] ${path.relative(root, dataPath)}：页面 ${(doc.pages ?? []).length} · 块实例 ${blockCount} · 块定义 ${declarations.size}`
)
for (const warning of warnings) console.warn(`[check] ⚠ ${warning}`)

if (errors.length) {
  console.error(`[check] ✗ 发现 ${errors.length} 个阻断问题：`)
  for (const error of errors.slice(0, 60)) console.error(`  - ${error}`)
  if (errors.length > 60) console.error(`  …… 另有 ${errors.length - 60} 条`)
  process.exit(1)
}
console.log('[check] ✓ 契约校验通过（块键名、必填项、H1 唯一性 · 嵌套子字段已递归校验）')
