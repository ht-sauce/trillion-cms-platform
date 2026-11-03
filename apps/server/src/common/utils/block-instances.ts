/**
 * 页面块实例重建工具（内容域派生页面共用）
 *
 * 新闻 / 问答（news-faq 模块）与产品 / 案例（catalog 模块）在「管理表 → 发布产物页面」
 * 的派生过程中都需要把「按模板重算出的块数组」写回页面，并且要保持块实例 id 稳定：
 * 同 key 按出现顺序复用旧实例 id，结构不变时页面内容指纹不变（增量发布不会误判变更）。
 */
import { normalizeBlockInstances } from './content-hash'

/** 同步后的块实例写入形态（与 Page.blocks 的元素结构一致） */
export interface BlockInstanceInput {
  id: string
  key: string
  enabled: boolean
  data: Record<string, unknown>
  /** 页面节奏提示（ADR-036），原样保留，缺省由渲染器按块 key 取默认值 */
  section?: string
}

/** 生成新的块实例 id（前缀为 key 去连字符截 8 位，4 位数字后缀，页内唯一） */
function generateInstanceId(key: string, used: Set<string>): string {
  const prefix = key.replace(/-/g, '').slice(0, 8)
  let id = ''
  do {
    id = `${prefix}_${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
  } while (used.has(id))
  used.add(id)
  return id
}

/**
 * 给重建后的块实例分配 id：同 key 按出现顺序复用旧实例的 id，
 * 旧实例不够用时生成新 id——常规编辑（只改数据不改结构）下内容指纹保持稳定
 */
export function withStableIds(
  next: { key: string; enabled?: boolean; data: Record<string, unknown> }[],
  oldBlocks?: unknown
): BlockInstanceInput[] {
  const used = new Set<string>()
  const reusable = new Map<string, { id: string; section?: string }[]>()
  for (const inst of normalizeBlockInstances(oldBlocks)) {
    if (inst.id && !used.has(inst.id)) {
      used.add(inst.id)
      const list = reusable.get(inst.key) ?? []
      list.push({ id: inst.id, section: inst.section })
      reusable.set(inst.key, list)
    }
  }

  const cursor = new Map<string, number>()
  return next.map((item) => {
    const list = reusable.get(item.key) ?? []
    const index = cursor.get(item.key) ?? 0
    cursor.set(item.key, index + 1)
    const reuse = list[index]
    const id = reuse?.id ?? generateInstanceId(item.key, used)
    return reuse?.section
      ? { id, key: item.key, enabled: item.enabled ?? true, data: item.data, section: reuse.section }
      : { id, key: item.key, enabled: item.enabled ?? true, data: item.data }
  })
}

/** 取块数组中某 key 的首块数据（无则空对象） */
export function blockData(blocks: BlockInstanceInput[], key: string): Record<string, unknown> {
  return (blocks.find((block) => block.key === key)?.data ?? {}) as Record<string, unknown>
}

/**
 * 按模板骨架组装块数组（内容域派生页面共用）：
 * - overrides[key] 为对象：以模板块数据为底、覆盖同名键（保留 note/columns/title 等站点级口径）
 * - overrides[key] 为 null：该块不输出；若其前一个块是 section-head，分组头一并跳过
 * - 模板中未出现在 overrides 里的块原样保留（telbar、notice 等固定块）
 */
export function assembleFromTemplate(
  template: BlockInstanceInput[],
  overrides: Record<string, Record<string, unknown> | null>
): { key: string; enabled: boolean; data: Record<string, unknown> }[] {
  const result: { key: string; enabled: boolean; data: Record<string, unknown> }[] = []
  for (let index = 0; index < template.length; index += 1) {
    const block = template[index]
    if (block.key === 'section-head') {
      /** 向后找到第一个非 section-head 的内容块，决定分组头是否保留 */
      let next = index + 1
      while (next < template.length && template[next].key === 'section-head') next += 1
      const nextKey = template[next]?.key
      if (nextKey && nextKey in overrides && overrides[nextKey] === null) continue
      result.push({ key: 'section-head', enabled: block.enabled, data: block.data })
      continue
    }
    if (block.key in overrides) {
      const patch = overrides[block.key]
      if (patch === null) continue
      result.push({ key: block.key, enabled: block.enabled, data: { ...block.data, ...patch } })
      continue
    }
    result.push({ key: block.key, enabled: block.enabled, data: block.data })
  }
  return result
}
