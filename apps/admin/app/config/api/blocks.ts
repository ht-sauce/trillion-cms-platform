/**
 * 块库接口（块代码化：Vue SFC 源码是唯一事实来源，字段声明从源码抽取）
 *
 * 服务端控制器 `apps/server/src/modules/blocks/blocks.controller.ts`。
 * 保存块代码编译失败时返回 400，响应体 `data.compileError = { line, column, message }`，
 * 由页面捕获后标红错误行（http.ts 只统一提示 message，编译详情由调用方自行读取）。
 *
 * **块隔离（09 §4.5）**：公共块（siteId = 0）只作**模板**，站点引用后复制为本站自有块；
 * 因此列表里同一个 key 可能同时出现「本站块」与「公共模板」两行，页面据此分组展示。
 */
import { get, post, put } from './http'
import type { BlockCompileStatus, BlockDeclaration, BlockScope } from '@trillion/shared'

/** 契约类型透出：页面用块归属 / 声明类型时不必再直接依赖 shared 包 */
export type { BlockCompileStatus, BlockDeclaration, BlockScope }

/** 公共模板的 siteId 约定值（字符串哨兵，与服务端 PUBLIC_BLOCK_SITE_ID 对齐） */
export const PUBLIC_BLOCK_SITE_ID = '0'

/** 块库列表项（不含源码） */
export interface BlockListItem {
  id: string
  key: string
  name: string
  hint: string
  scope: BlockScope
  siteId: string | null
  codeHash: string
  compileStatus: BlockCompileStatus
  compileError: string | null
  version: number
  updatedAt: string
  /** 声明中的字段数 */
  fieldCount: number
  /** true = 本站自有块；false = 公共模板 */
  isSiteScoped: boolean
}

/** 块详情（含源码、声明与历史版本） */
export interface BlockDetail extends BlockListItem {
  code: string
  declaration: BlockDeclaration
  versions: { id: string; version: number; codeHash: string; createdAt: string; createdBy: string | null }[]
}

/** 使用位置：引用了该块的页面清单 */
export interface BlockUsage {
  pageId: string
  title: string
  path: string
  status: string
  /** 该页面引用此块的实例数 */
  count: number
  /** 其中启用中的实例数 */
  enabled: number
}

/** 编译错误定位（保存块代码失败时响应体携带） */
export interface BlockCompileError {
  line: number
  column: number
  message: string
}

/** 新建块入参（key 由源码声明决定，不由表单填写） */
export interface CreateBlockPayload {
  scope: BlockScope
  /** scope = site 时必填 */
  siteId?: string
  code: string
}

/** 保存块代码入参 */
export interface SaveBlockCodePayload {
  siteId?: string
  code: string
}

export const blocksApi = {
  /** 块库列表（本站块 + 公共模板；同一个 key 可能两行） */
  list(siteId: string) {
    return get<BlockListItem[]>('/blocks', { siteId })
  },
  /** 块详情（源码 + 字段声明 + 版本历史）；template=true 明确只读公共模板 */
  detail(key: string, siteId: string, options: { template?: boolean } = {}) {
    return get<BlockDetail>(`/blocks/${key}`, options.template ? { siteId, template: 1 } : { siteId })
  },
  /** 把公共模板引入本站（复制为本站自有块，幂等） */
  apply(key: string, siteId: string) {
    return post<{ key: string; siteId: string; id: string | null; copied: number }>(`/blocks/${key}/apply`, { siteId })
  },
  create(payload: CreateBlockPayload) {
    return post<BlockDetail>('/blocks', payload)
  },
  /** 保存块代码（编译失败 → 400 + compileError） */
  save(key: string, payload: SaveBlockCodePayload) {
    return put<BlockDetail>(`/blocks/${key}`, payload)
  },
  usages(key: string, siteId: string) {
    return get<BlockUsage[]>(`/blocks/${key}/usages`, { siteId })
  },
  /** 回退上一版（版本号仍自增，保证可继续回退） */
  rollback(key: string, siteId?: string) {
    return post<BlockDetail>(`/blocks/${key}/rollback`, { siteId })
  }
}
