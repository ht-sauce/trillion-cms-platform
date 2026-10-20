/** 内容状态流：草稿 → 待审核 → 已发布 */
export type ContentStatus = 'draft' | 'pending_review' | 'published'

type Locale = 'zh-CN'

/** 栏目（目录/功能块），支持树形 */
export interface ChannelEntity {
  id: string
  siteId: string
  parentId: string | null
  name: string
  slug: string
  sort: number
  seoTitle: string | null
  seoDescription: string | null
  locale: Locale
  createdAt: string
  updatedAt: string
}

/** 页面 = 模板 + 结构化 Block 数据 */
export interface PageEntity {
  id: string
  siteId: string
  channelId: string
  /** 使用的模板标识 */
  templateId: string
  title: string
  slug: string
  status: ContentStatus
  /** 摘要，llms.txt 与 meta description 复用 */
  summary: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  /** 结构化 Block 数组 */
  blocks: BlockData[]
  /** 作者署名（E-E-A-T 信号） */
  authorName: string | null
  publishedAt: string | null
  locale: Locale
  createdAt: string
  updatedAt: string
}

/** 结构化 Block 数据（每种类型有各自的 payload 结构） */
export type BlockData = HeroBlock | TextBlock | FaqBlock | ImageListBlock | ContactBlock

/** 首屏 Banner Block */
export interface HeroBlock {
  type: 'hero'
  title: string
  subtitle?: string
  imageFileId?: string | null
  buttonText?: string
  buttonUrl?: string
}

/** 图文段落 Block（结构化：标题 + 段落数组，非自由富文本） */
export interface TextBlock {
  type: 'text'
  heading: string
  paragraphs: string[]
}

/** 问答 Block：GEO 核心，自动生成 FAQPage 结构化数据 */
export interface FaqBlock {
  type: 'faq'
  items: { question: string; answer: string }[]
}

/** 图片列表 Block */
export interface ImageListBlock {
  type: 'imageList'
  items: { imageFileId: string; title: string; alt?: string }[]
}

/** 联系信息 Block（搜索引擎本地化信号） */
export interface ContactBlock {
  type: 'contact'
  address?: string
  phone?: string
  email?: string
}

/** 模板定义（Block 槽位组合） */
export interface TemplateDefinition {
  /** 模板标识 */
  id: string
  name: string
  /** 该模板包含的槽位 Block 类型序列 */
  slots: BlockData['type'][]
}
