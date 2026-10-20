/** 站点渲染模式：站点级开关，可随时切换 */
export type RenderMode = 'ssg' | 'ssr'

/** 站点启停状态 */
export type SiteStatus = 'active' | 'disabled'

/** AI 爬虫放行策略（robots.txt 生成依据） */
export interface RobotsPolicy {
  /** 是否默认放行全部已知 AI 爬虫 */
  allowAllAi: boolean
  /** 单独屏蔽的爬虫 UA 关键字列表 */
  blockedAgents: string[]
  /** 额外放行的爬虫 UA 关键字列表 */
  extraAllowedAgents: string[]
}

/** 站点主题令牌（驱动 GEO 项目渲染外观） */
export interface ThemeConfig {
  /** 品牌主色 */
  primary: string
  /** 强调色（数据/高亮） */
  accent: string
  /** 底色 */
  background: string
  /** 主文本色 */
  text: string
  /** 字体族 */
  fontFamily?: string
  /** 圆角基准 */
  radius?: number
}

/** 站点实体（含企业元数据，站点 = 企业） */
export interface SiteEntity {
  id: string
  /** 网站名称，展示用 */
  name: string
  /** 站点标识，同时作为 SSG 产物目录名 */
  slug: string
  /** 主域名（唯一规范地址：SEO 绝对 URL / 列表预览都用它） */
  domain: string
  /** 别名域名（不含主域名）：同站点多域名访问映射，见 ADR-022 */
  domains?: string[]
  /** 企业名称（营业执照全称） */
  companyName: string
  /** 统一社会信用代码 */
  creditCode?: string | null
  /** 企业地址 */
  companyAddress?: string | null
  /** 联系电话 */
  contactPhone?: string | null
  /** 联系邮箱 */
  contactEmail?: string | null
  /** ICP 备案号，站点页脚自动输出 */
  icpNumber?: string | null
  /** 公安备案号 */
  policeNumber?: string | null
  /** 营业执照图片静态文件 ID */
  businessLicenseFileId?: string | null
  /** 站点 Logo 静态文件 ID */
  logoFileId?: string | null
  /** 站点 Favicon 静态文件 ID */
  faviconFileId?: string | null
  /** 默认 SEO 标题 */
  seoTitle?: string | null
  /** 默认 SEO 描述 */
  seoDescription?: string | null
  /** 默认关键字 */
  seoKeywords?: string | null
  /** 默认语言，v1 固定 zh-CN，字段预留 */
  defaultLocale: string
  /** AI 爬虫策略 */
  robotsPolicy: RobotsPolicy
  /** 渲染模式 */
  renderMode: RenderMode
  /** 主题配置 */
  themeConfig: ThemeConfig
  /** 站点状态 */
  status: SiteStatus
  createdAt: string
  updatedAt: string
}

/** 静态文件（URL 与物理存储解耦） */
export interface StaticFileEntity {
  id: string
  /** 归属站点 */
  siteId: string | null
  /** 用户原始文件名 */
  originalName: string
  /** 物理存储相对路径 */
  storagePath: string
  /** 对外访问 URL */
  publicUrl: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  uploadedBy: string | null
  createdAt: string
}
