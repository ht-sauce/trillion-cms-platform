/**
 * 站点企业实体档案契约（NAP 唯一事实来源的字段口径）
 * 依据 docs/spec/09-site-editor.md §3.1、§7.4、§10 与设计稿 BLOCKS.md 第一节。
 * 约定：**只有机构实体档案页可写，其他页面一律只读引用**。
 */

/** 门诊时间规则（支持季节区分与「午间不休息/周末节假日正常」备注） */
export interface OpeningHourRule {
  /** 适用季节，如「夏季」；不区分季节留空 */
  season?: string
  /** 适用日，如「周一至周日」「周一至周五」 */
  weekday: string
  /** 开始时间 HH:mm */
  open: string
  /** 结束时间 HH:mm */
  close: string
  /** 补充说明，如「午间不休息」「法定节假日正常接诊」 */
  note?: string
}

/** 关联标识（官网 / 公众号 / 地图 / 卫健委公示 / 企业信用公示等） */
export interface SameAsEntry {
  /** 平台名，如「微信公众号」 */
  platform: string
  /** 链接 */
  url: string
  /** 核验状态：verified 已核验 / pending 待核验 */
  status?: 'verified' | 'pending'
  /** 最后核验时间（YYYY-MM-DD） */
  checkedAt?: string
}

/** 站点设计令牌（驱动站点外观，与后台主题完全解耦，见 09 §7.4） */
export interface SiteThemeTokens {
  teal: string
  tealDk: string
  deep: string
  deep2: string
  blue: string
  ink: string
  ink2: string
  ink3: string
  line: string
  bg: string
  ok: string
  amber: string
  radiusSm: number
  radiusMd: number
  radiusLg: number
  wrap: number
}

/** robots meta 摘要策略（完整摘要：max-snippet:-1 / max-image-preview:large） */
export interface RobotsMeta {
  index: boolean
  follow: boolean
  maxSnippet: number
  maxImagePreview: 'none' | 'standard' | 'large'
  maxVideoPreview: number
}

/** 站点企业实体档案（Site 表的对外口径） */
export interface SiteProfileEntity {
  id: string
  /** 网站名称 */
  name: string
  /** 站点标识（= 产物目录名） */
  slug: string
  /** 主域名 */
  domain: string

  // ---- 标识 ----
  /** 工商全称（营业执照口径） */
  legalName: string
  /** 对外常用名 */
  commonName: string
  /** 简称 / 曾用名 */
  abbrName: string[]
  /** 头部 LOGO 英文副标（框架块 site-header；为空则不渲染） */
  logoSubtitle: string | null
  /** 头部 LOGO 方形标记内单字（框架块 site-header；为空时取 commonName 首字） */
  logoMark: string | null

  // ---- 资质 ----
  /** 医疗机构登记号 */
  clinicRegNo: string | null
  /** 执业许可证发证机关（法定信息，页脚可见；须取自证件原件） */
  issuingAuthority: string | null
  /** 执业许可证有效期起 */
  licenseValidFrom: string | null
  /** 执业许可证有效期止 */
  licenseValidTo: string | null
  /** 机构类型 */
  orgType: string | null
  /** 机构等级 */
  level: string | null
  /** 法定代表人 */
  legalPerson: string | null
  /** 主要负责人 */
  principal: string | null
  /** 成立日期 */
  foundDate: string | null
  /** 诊疗科目 */
  practiceScopes: string[]

  // ---- NAP ----
  /** 地址（对外逐字口径） */
  addressFull: string | null
  /** 邮政编码 */
  postalCode: string | null
  /** 纬度 */
  lat: string | null
  /** 经度 */
  lng: string | null
  /** 对外唯一电话（NAP-P） */
  phone: string | null
  /** 电话服务时间 */
  phoneServiceHours: string | null

  // ---- 门诊 ----
  openingHours: OpeningHourRule[]

  // ---- 医保 ----
  medicalInsurance: boolean
  insuranceNo: string | null
  /** 医保口径补充说明（非定点时的院内减免口径等） */
  insuranceNote: string | null

  // ---- 关联标识 ----
  sameAs: SameAsEntry[]

  // ---- 其他 ----
  /** 统一社会信用代码 */
  creditCode: string | null
  icpNumber: string | null
  policeNumber: string | null
  /** 站点设计令牌 */
  themeTokens: Partial<SiteThemeTokens>
  /** 内部联系邮箱 */
  contactEmail: string | null
  /** SEO 默认值 */
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 机构实体档案的「待补」字段清单（缺失时在实体档案页显式标注，避免编造）
 * 返回缺失字段的中文名，供页面与后台提示使用
 */
export const SITE_PROFILE_PENDING_LABELS: Record<string, string> = {
  legalName: '工商全称',
  creditCode: '统一社会信用代码',
  clinicRegNo: '医疗机构登记号',
  licenseValidFrom: '执业许可证有效期（起）',
  licenseValidTo: '执业许可证有效期（止）',
  orgType: '机构类型',
  level: '机构等级',
  legalPerson: '法定代表人',
  foundDate: '成立日期',
  insuranceNo: '医保定点编号'
}

/** 计算档案中仍待补的字段（值缺失或为占位符时视为待补） */
export function detectPendingProfileFields(profile: {
  legalName?: string | null
  creditCode?: string | null
  clinicRegNo?: string | null
  licenseValidFrom?: string | null
  licenseValidTo?: string | null
  orgType?: string | null
  level?: string | null
  legalPerson?: string | null
  foundDate?: string | null
  insuranceNo?: string | null
}): string[] {
  return Object.entries(SITE_PROFILE_PENDING_LABELS)
    .filter(([key]) => {
      const value = (profile as Record<string, unknown>)[key]
      return value === null || value === undefined || value === ''
    })
    .map(([, label]) => label)
}
