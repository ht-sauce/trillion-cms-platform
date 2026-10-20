/**
 * 站点模块 DTO：入参校验，写操作字段在此集中定义
 */
import { PartialType } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type {
  OpeningHourRule,
  RenderMode,
  RobotsMeta,
  RobotsPolicy,
  SameAsEntry,
  SiteStatus,
  ThemeConfig
} from '@trillion/shared'

/** 注：管理后台的全局默认值为简洁起见使用 any 兼容 JSON 字段 */

export class QuerySiteDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  page?: number

  @ApiPropertyOptional({ description: '每页条数' })
  @IsOptional()
  pageSize?: number

  @ApiPropertyOptional({ description: '关键字：站点名/标识/域名/企业名称' })
  @IsOptional()
  @IsString()
  keyword?: string

  @ApiPropertyOptional({ description: '渲染模式 ssg/ssr' })
  @IsOptional()
  @IsString()
  renderMode?: RenderMode

  @ApiPropertyOptional({ description: '状态 active/disabled' })
  @IsOptional()
  @IsString()
  status?: SiteStatus
}

export class CreateSiteDto {
  @ApiProperty({ description: '网站名称' })
  @IsString()
  @MaxLength(64)
  name: string

  @ApiProperty({ description: '站点标识，同时作为 SSG 产物目录名' })
  @IsString()
  @MaxLength(32)
  slug: string

  @ApiProperty({ description: '主域名' })
  @IsString()
  @MaxLength(128)
  domain: string

  @ApiPropertyOptional({ description: '别名域名数组（不含主域名），全量替换语义', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  domains?: string[]

  @ApiProperty({ description: '企业名称（营业执照全称）' })
  @IsString()
  @MaxLength(128)
  companyName: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  creditCode?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyAddress?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icpNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policeNumber?: string

  @ApiPropertyOptional({ description: '营业执照静态文件 ID' })
  @IsOptional()
  @IsString()
  businessLicenseFileId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoFileId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  faviconFileId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoKeywords?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultLocale?: string

  @ApiPropertyOptional({ description: 'AI 爬虫策略 JSON' })
  @IsOptional()
  robotsPolicy?: RobotsPolicy

  @ApiPropertyOptional({ description: '渲染模式' })
  @IsOptional()
  @IsString()
  renderMode?: RenderMode

  @ApiPropertyOptional({ description: '主题令牌 JSON' })
  @IsOptional()
  themeConfig?: ThemeConfig

  // ---------- 企业实体标识（GEO 实体唯一性基础，09 §3.1） ----------

  @ApiPropertyOptional({ description: '工商登记全称（营业执照口径）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  legalName?: string

  @ApiPropertyOptional({ description: '对外常用名（H1 / title / NAP 使用）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  commonName?: string

  @ApiPropertyOptional({ description: '简称与曾用名数组，输出为 alternateName' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  abbrName?: string[]

  @ApiPropertyOptional({ description: '头部 LOGO 英文副标（框架块 site-header 用）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  logoSubtitle?: string

  @ApiPropertyOptional({ description: '头部 LOGO 方形标记内单字（为空时取 commonName 首字）' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  logoMark?: string

  // ---------- 医疗机构资质 ----------

  @ApiPropertyOptional({ description: '医疗机构登记号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clinicRegNo?: string

  @ApiPropertyOptional({ description: '执业许可证有效期起（YYYY-MM-DD）' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  licenseValidFrom?: string

  @ApiPropertyOptional({ description: '执业许可证有效期止（YYYY-MM-DD）' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  licenseValidTo?: string

  @ApiPropertyOptional({ description: '机构类型，如「专科医院」' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orgType?: string

  @ApiPropertyOptional({ description: '机构等级，如「二级」' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  level?: string

  @ApiPropertyOptional({ description: '法定代表人' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  legalPerson?: string

  @ApiPropertyOptional({ description: '主要负责人' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  principal?: string

  @ApiPropertyOptional({ description: '成立日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  foundDate?: string

  @ApiPropertyOptional({ description: '诊疗科目数组' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  practiceScopes?: string[]

  @ApiPropertyOptional({ description: '执业许可证发证机关（法定信息，页脚可见）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  issuingAuthority?: string

  // ---------- NAP（Name / Address / Phone） ----------

  @ApiPropertyOptional({ description: '地址（对外逐字口径，全站唯一写法）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressFull?: string

  @ApiPropertyOptional({ description: '邮政编码' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  postalCode?: string

  @ApiPropertyOptional({ description: '纬度（字符串保留原始精度）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  lat?: string

  @ApiPropertyOptional({ description: '经度（字符串保留原始精度）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  lng?: string

  @ApiPropertyOptional({ description: '对外唯一电话（NAP-P）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @ApiPropertyOptional({ description: '电话服务时间说明' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  phoneServiceHours?: string

  // ---------- 门诊时间 / 医保 ----------

  @ApiPropertyOptional({ description: '门诊时间规则数组（含季节区分与备注）' })
  @IsOptional()
  @IsArray()
  openingHours?: OpeningHourRule[]

  @ApiPropertyOptional({ description: '是否医保定点' })
  @IsOptional()
  @IsBoolean()
  medicalInsurance?: boolean

  @ApiPropertyOptional({ description: '医保定点编号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  insuranceNo?: string

  @ApiPropertyOptional({ description: '医保口径补充说明（非定点时的院内减免口径等）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  insuranceNote?: string

  // ---------- 关联标识（实体置信度） ----------

  @ApiPropertyOptional({ description: '关联标识数组（官网 / 公众号 / 地图 / 卫健委公示…）' })
  @IsOptional()
  @IsArray()
  sameAs?: SameAsEntry[]

  @ApiPropertyOptional({ description: '站点设计令牌（驱动站点外观，与后台主题解耦）' })
  @IsOptional()
  themeTokens?: Record<string, unknown>

  // ---------- GEO 文档双模式（09 §10.3） ----------

  @ApiPropertyOptional({ description: '机构实体 JSON-LD 自定义内容' })
  @IsOptional()
  @IsString()
  geoJsonLd?: string

  @ApiPropertyOptional({ description: '实体 JSON-LD 模式：auto_append / override' })
  @IsOptional()
  @IsIn(['auto_append', 'override'])
  geoJsonLdMode?: 'auto_append' | 'override'

  @ApiPropertyOptional({ description: 'llms.txt 自定义内容' })
  @IsOptional()
  @IsString()
  llmsTxt?: string

  @ApiPropertyOptional({ description: 'llms.txt 模式：auto_append / override' })
  @IsOptional()
  @IsIn(['auto_append', 'override'])
  llmsTxtMode?: 'auto_append' | 'override'

  @ApiPropertyOptional({ description: 'head 扩展（白名单净化后注入，禁止可执行脚本）' })
  @IsOptional()
  @IsString()
  headExtra?: string

  @ApiPropertyOptional({ description: 'head 扩展模式：auto_append / override' })
  @IsOptional()
  @IsIn(['auto_append', 'override'])
  headExtraMode?: 'auto_append' | 'override'

  @ApiPropertyOptional({ description: 'robots meta 摘要策略 JSON' })
  @IsOptional()
  robotsMeta?: RobotsMeta

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: SiteStatus
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

/**
 * 建站描述导入（09 §12.2）
 * 一次性把「站点档案 + 目录树 + 页面 + 块数据 + 导航」灌进一个站点，
 * 目标是把「建站」从后台点几十次变成一次可复核的批量操作。
 */
export class BootstrapSiteDto {
  @ApiProperty({ description: '站点标识（已存在则更新档案，不存在则按描述创建）' })
  @IsString()
  @MaxLength(32)
  slug: string

  @ApiProperty({ description: '网站名称' })
  @IsString()
  @MaxLength(64)
  name: string

  @ApiPropertyOptional({ description: '主域名，缺省用 localhost:<GEO 端口> 的占位值' })
  @IsOptional()
  @IsString()
  domain?: string

  @ApiPropertyOptional({ description: '企业实体档案字段（见 CreateSiteDto 同名字段）' })
  @IsOptional()
  profile?: Record<string, unknown>

  @ApiPropertyOptional({ description: '目录树：{ name, slug, parentSlug?, children? }[]' })
  @IsOptional()
  @IsArray()
  channels?: BootstrapChannelInput[]

  @ApiPropertyOptional({ description: '页面：{ channelSlug, title, slug, kind?, summary?, blocks[] }[]' })
  @IsOptional()
  @IsArray()
  pages?: BootstrapPageInput[]

  @ApiPropertyOptional({ description: '导航：{ key, items[] }[]' })
  @IsOptional()
  @IsArray()
  navigations?: BootstrapNavigationInput[]

  @ApiPropertyOptional({ description: '建站后是否自动发布（默认 false，交由人工确认）' })
  @IsOptional()
  @IsBoolean()
  publish?: boolean
}

/** 导入描述里的目录项 */
export interface BootstrapChannelInput {
  name: string
  slug: string
  parentSlug?: string | null
  sort?: number
}

/** 导入描述里的页面项 */
export interface BootstrapPageInput {
  channelSlug: string
  title: string
  slug: string
  kind?: 'static' | 'list' | 'detail'
  summary?: string
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string
  authorName?: string
  templateId?: string
  /** 块实例数组（{ id, key, data }） */
  blocks?: Record<string, unknown>[]
  /** 编审信息（医疗类内容发布前置） */
  editorial?: Record<string, unknown>
  sort?: number
}

/**
 * 导入描述里的导航项
 *
 * `pageSlug` 支持三种定位写法（目录落地页的 slug 恒为 `index`，裸 slug 会跨目录重名）：
 * 1. 绝对路径 `/doctors` → 按页面物化路径匹配（推荐）
 * 2. 复合键 `doctors/index` → 按「目录 slug / 页面 slug」匹配
 * 3. 裸 slug `home` → 仅当该 slug 全站唯一时匹配，否则报错
 */
export interface BootstrapNavigationInput {
  key: string
  items: { label: string; pageSlug?: string; href?: string }[]
}
