/**
 * 站点内容编辑器契约（块代码化 + 三态 + GEO 双模式）
 * 依据 docs/spec/09-site-editor.md §3 ~ §5、§10。
 * 三端共用：服务端做编译校验与声明抽取，管理后台据此渲染数据表单，渲染引擎据此渲染块。
 */

/** 页面类型：静态页 / 列表页 / 详情页 */
export type PageKind = 'static' | 'list' | 'detail'

/** 块字段类型（**不提供富文本**，守「禁止富文本自由编辑 Block」） */
export type BlockFieldType =
  'text' | 'textarea' | 'number' | 'switch' | 'select' | 'file' | 'url' | 'link' | 'list' | 'group'

/** list 子项 / group 子项的类型声明（无 key、label，仅描述子结构） */
export interface BlockFieldItemSchema {
  /** 子项类型 */
  type: BlockFieldType
  /** type = group 时的子字段清单 */
  fields?: BlockFieldSchema[]
  /** type = list 时的更深一层子项（嵌套列表，谨慎使用） */
  item?: BlockFieldItemSchema
  /** type = select 时的可选项 */
  options?: string[]
}

/** 块字段声明：写在块代码内，由服务端从源码抽取，驱动后台数据表单 */
export interface BlockFieldSchema {
  /** 字段键，块内 data 对象的属性名 */
  key: string
  /** 表单标签 */
  label: string
  /** 字段类型 */
  type: BlockFieldType
  /** 是否必填（发布前检查与表单校验共用） */
  required?: boolean
  /** 填写提示（表单下方灰字） */
  hint?: string
  /** type = select 时的可选项 */
  options?: string[]
  /** type = list 时的子项声明（list 的子项再挂子字段，走 item.item.fields） */
  item?: BlockFieldItemSchema
  /**
   * type = group 时的子字段清单（与 list 的 `item` 并列，两者不同时出现）
   * 例：`{ key: 'sidebarEditorial', type: 'group', fields: [writer, reviewer, ...] }`
   */
  fields?: BlockFieldSchema[]
  /** 默认值 */
  default?: unknown
}

/** 块数据来源 */
export type BlockDataSource =
  /** 数据在本页录入 */
  | { kind: 'manual' }
  /** 列表页：取「所在目录下的子页面集合」（见 09 §4.4） */
  | { kind: 'childPages'; channelSlug: string }

/** 块声明：块代码内 `defineBlock({...})` 的入参形态 */
export interface BlockDeclaration {
  /** 块标识：^[a-z][a-z0-9-]{1,40}$ */
  key: string
  /** 展示名 */
  name: string
  /** 用途说明（块库卡片） */
  hint?: string
  /** 字段声明 */
  fields: BlockFieldSchema[]
  /** 数据来源，缺省为 manual */
  dataSource?: BlockDataSource
}

/** 块实例：页面 blocks 数组的元素 */
export interface BlockInstance {
  /** 实例 ID（nanoid），用于画布定位与 data-block-id */
  id: string
  /** 块定义 key */
  key: string
  /** 是否启用（停用块渲染时跳过） */
  enabled: boolean
  /** 该实例的数据（键与 BlockFieldSchema.key 对应） */
  data: Record<string, unknown>
}

/** 块归属：公共块（全站可用）/ 站点私有块 */
export type BlockScope = 'public' | 'site'

/** 块编译状态 */
export type BlockCompileStatus = 'ok' | 'error'

/** 块定义实体（块代码的唯一事实来源） */
export interface BlockDefinitionEntity {
  id: string
  key: string
  name: string
  hint: string
  scope: BlockScope
  /** scope = site 时必填 */
  siteId: string | null
  /** Vue SFC 源码 */
  code: string
  /** 代码指纹 */
  codeHash: string
  compileStatus: BlockCompileStatus
  compileError: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/** 块定义列表项（不含 code，列表页用） */
export interface BlockSummary {
  id: string
  key: string
  name: string
  hint: string
  scope: BlockScope
  siteId: string | null
  codeHash: string
  compileStatus: BlockCompileStatus
  version: number
  updatedAt: string
  /** 声明中的字段数（列表页展示） */
  fieldCount?: number
  /** 使用该块（代码版本）的页面路径清单（使用位置） */
  usages?: string[]
}

/** 块编译校验结果（保存块代码时返回） */
export interface BlockCompileResult {
  ok: boolean
  version?: number
  codeHash?: string
  declaration?: BlockDeclaration
  error?: { line: number; column: number; message: string }
}

// ---------------- 数据注入契约（块可直接拿到什么，见 09 §5） ----------------

/** 站点上下文（块内只读引用） */
export interface BlockSiteContext {
  id: string
  name: string
  commonName: string
  legalName: string
  abbrName: string[]
  slug: string
  domain: string
  icpNumber: string | null
  policeNumber: string | null
  creditCode: string | null
  clinicRegNo: string | null
  phone: string | null
  addressFull: string | null
  postalCode: string | null
  lat: string | null
  lng: string | null
  openingHours: unknown[]
  medicalInsurance: boolean
  insuranceNo: string | null
  logoUrl: string | null
  faviconUrl: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  themeTokens: Record<string, string>
  /** 机构实体档案页路径（NAP 唯一事实来源） */
  entityPath: string
}

/** 页面上下文 */
export interface BlockPageContext {
  id: string
  title: string
  path: string
  kind: PageKind
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  publishedAt: string | null
  updatedAt: string | null
  authorName: string | null
}

/** 目录上下文（面包屑用） */
export interface BlockChannelContext {
  id: string
  name: string
  slug: string
  path: string
  ancestors: { id: string; name: string; slug: string; path: string }[]
}

/** 实体引用（GEO 一致性） */
export interface BlockEntityRef {
  name: string
  aliases: string[]
  type: string
  description: string | null
}

/** 块渲染上下文：块代码通过 props.context 获取 */
export interface BlockContext {
  site: BlockSiteContext
  page: BlockPageContext
  channel: BlockChannelContext | null
  block: { id: string; key: string; enabled: boolean }
  /** 仅 dataSource.kind = childPages 时注入的列表数据 */
  items?: unknown[]
  entities: BlockEntityRef[]
  /** 构建期/请求期日期（YYYY-MM-DD） */
  now: string
  /** v1 固定 zh-CN */
  locale: string
}

// ---------------- 三态与 GEO ----------------

/** 编审信息（医疗类内容发布前置，见 09 §7.2 硬约束 6） */
export interface EditorialInfo {
  /** 撰稿人 */
  writer: string
  /** 审核医师 */
  reviewer: string
  /** 来源 */
  source: string
  /** 复核日期（YYYY-MM-DD） */
  nextReviewDate: string
}

/** 整页草稿快照：后写覆盖（不构建、不影响线上） */
export interface PageDraft {
  title: string
  slug: string
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  authorName: string | null
  kind: PageKind
  blocks: BlockInstance[]
  /** 医疗类页面的编审信息 */
  editorial: EditorialInfo | null
  /** 草稿最后保存时间（北京时间串） */
  updatedAt: string
}

/** GEO 文档双模式：自动+追加 / 全量覆盖（见 09 §10.3） */
export type GeoDocMode = 'auto_append' | 'override'

/** GEO 文档（JSON-LD / llms.txt / head 扩展 / robots meta 共用） */
export interface GeoDoc {
  mode: GeoDocMode
  /** 用户自定义内容（自动生成结果不落库，构建期现算） */
  custom: string
}

/** GEO 生成预览请求（纯计算、不落盘） */
export interface GeoPreviewInput {
  siteId: string
  /** 目标：page-jsonld / entity-jsonld / llms / head / robots-meta */
  target: 'page-jsonld' | 'entity-jsonld' | 'llms' | 'head' | 'robots-meta'
  pageId?: string
  mode?: GeoDocMode
  custom?: string
}

/** GEO 生成预览结果 */
export interface GeoPreviewResult {
  /** 系统自动生成的内容 */
  auto: string
  /** 实际会输出的内容（按 mode 拼接后的最终结果） */
  output: string
}

// ---------------- 内容树与产物清单 ----------------

/** 内容树节点徽标（由产物清单派生） */
export type ContentBadge = 'published' | 'pending' | 'missing' | 'draft'

/** 内容树节点：目录 / 页面 / 块 三层 */
export interface ContentTreeNode {
  id: string
  type: 'channel' | 'page'
  name: string
  slug: string
  path: string
  sort: number
  /** 页面专属 */
  kind?: PageKind
  status?: string
  badge?: ContentBadge
  /** 块缺失标记（页面引用了库中不存在的块 key） */
  hasMissingBlock?: boolean
  children?: ContentTreeNode[]
  blocks?: ContentBlockNode[]
}

/** 内容树中的块节点 */
export interface ContentBlockNode {
  id: string
  key: string
  name: string
  enabled: boolean
  /** 块定义是否缺失 */
  missing: boolean
}

/** 产物清单条目（页面 ↔ 产物一一对应，见 09 §8.2） */
export interface ArtifactPageEntry {
  pageId: string
  path: string
  file: string
  contentHash: string
  fileHash?: string
  publishedAt: string
  blocks: { id: string; key: string; codeHash: string }[]
}

/** 产物清单（sites/<slug>/_trillion.json） */
export interface ArtifactManifest {
  buildId: string
  siteId: string
  slug: string
  domain: string
  generatedAt: string
  routes: string[]
  pages: ArtifactPageEntry[]
}

/** 单页状态徽标取值（由 Page.contentHash / publishedHash 与清单比对派生） */
export interface PagePublishState {
  pageId: string
  status: 'published' | 'pending' | 'missing'
  /** 线上产物时间 */
  onlineAt: string | null
}
