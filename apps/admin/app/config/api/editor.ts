/**
 * 站点内容编辑器接口（内容树 / 目录 / 页面 / 三态草稿）
 *
 * 与 `content.ts`（平台级页面列表 + 状态流转）分工：
 * 这里是**站点维度**的操作台，服务端控制器 `apps/server/src/modules/content/editor.controller.ts`。
 * 契约类型复用 `@trillion/shared` 的 `types/editor.ts`，避免前后端字段漂移。
 */
import { get, post, patch, put, del } from './http'
import type { BlockInstance, ContentTreeNode, EditorialInfo, GeoDocMode, PageDraft, PageKind } from '@trillion/shared'

/** 内容树（目录 + 页面 + 块摘要 + 发布徽标） */
export interface EditorTree {
  siteId: string
  slug: string
  lastBuiltAt: string | null
  nodes: ContentTreeNode[]
}

/** 新建目录入参 */
export interface CreateChannelPayload {
  siteId: string
  /** 缺省为一级目录 */
  parentId?: string | null
  name: string
  slug: string
  sort?: number
}

/** 编辑目录入参（已发布页面所在目录的 slug 会被服务端拒绝） */
export interface UpdateChannelPayload {
  name?: string
  slug?: string
  sort?: number
}

/** 新建页面入参 */
export interface CreatePagePayload {
  siteId: string
  channelId: string
  title: string
  /** 首页用 home */
  slug: string
  kind?: PageKind
  templateId?: string
  summary?: string
}

/** 编辑页面元信息入参 */
export interface UpdatePagePayload {
  title?: string
  slug?: string
  /** null 表示不改；已发布页面的所属目录由服务端锁定 */
  channelId?: string | null
  kind?: PageKind
  summary?: string
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string
  authorName?: string
  /** 页面级 JSON-LD 自定义内容 */
  jsonLd?: string
  jsonLdMode?: GeoDocMode
  /** 医疗类内容编审信息 */
  editorial?: EditorialInfo | null
  sort?: number
}

/** 草稿读取结果（无草稿时服务端返回线上快照，draft 恒不为空仅在有快照时） */
export interface DraftResult {
  pageId: string
  draft: PageDraft | null
}

/** 保存草稿入参（后写覆盖，不构建、不影响线上） */
export interface SaveDraftPayload {
  draft: Partial<PageDraft>
  /** 块实例数组（与草稿一并提交） */
  blocks?: BlockInstance[] | unknown[]
}

/** 上下移方向 */
export type MoveDirection = 'up' | 'down'

export const editorApi = {
  // ---------------- 内容树 ----------------
  tree(siteId: string) {
    return get<EditorTree>('/content/editor/tree', { siteId })
  },

  // ---------------- 目录 ----------------
  createChannel(payload: CreateChannelPayload) {
    return post<{ id: string }>('/content/editor/channels', payload)
  },
  updateChannel(id: string, payload: UpdateChannelPayload) {
    return patch<{ id: string }>(`/content/editor/channels/${id}`, payload)
  },
  removeChannel(id: string) {
    return del<{ id: string }>(`/content/editor/channels/${id}`)
  },
  moveChannel(id: string, direction: MoveDirection) {
    return post<{ id: string }>(`/content/editor/channels/${id}/move`, { direction })
  },

  // ---------------- 页面 ----------------
  createPage(payload: CreatePagePayload) {
    return post<{ id: string }>('/content/editor/pages', payload)
  },
  updatePage(id: string, payload: UpdatePagePayload) {
    return patch<{ id: string }>(`/content/editor/pages/${id}`, payload)
  },
  removePage(id: string) {
    return del<{ id: string; offline?: boolean; message?: string }>(`/content/editor/pages/${id}`)
  },
  movePage(id: string, direction: MoveDirection) {
    return post<{ id: string }>(`/content/editor/pages/${id}/move`, { direction })
  },

  // ---------------- 三态草稿 ----------------
  draft(pageId: string) {
    return get<DraftResult>(`/content/editor/pages/${pageId}/draft`)
  },
  saveDraft(pageId: string, payload: SaveDraftPayload) {
    return put<DraftResult>(`/content/editor/pages/${pageId}/draft`, payload)
  },
  deleteDraft(pageId: string) {
    return del<{ id: string }>(`/content/editor/pages/${pageId}/draft`)
  },
  /** 重算页面内容指纹（块代码变更后让徽标从「已发布」回到「待发布」） */
  refreshHash(pageId: string) {
    return post<{ id: string; contentHash: string }>(`/content/editor/pages/${pageId}/refresh-hash`)
  }
}
