/**
 * 发布前 GEO 校验（09 §10.4）
 *
 * 检查项分两级：
 *   - **阻断**（error）：不满足则不予发布 —— 缺标题/描述、canonical 冲突、医疗类缺编审、
 *     案例类出现禁止字段、无机构实体声明、无 llms.txt / robots 缺 AI 爬虫策略
 *   - **警告**（warn）：不阻断但要在发布确认弹窗里告知 —— robots meta 未开完整摘要、
 *     NAP 三处不一致、stat-bar 缺统计口径、sitemap 缺核心 URL
 *
 * 页面级与站点级分开：
 *   页面级随每次发布跑（快、只查本页）；
 *   站点级只在整站发布前跑（要读站点配置与全量路由）。
 */
import type { OpeningHourRule } from '@trillion/shared'

export interface GeoIssue {
  level: 'warn' | 'error'
  field: string
  message: string
}

export interface GeoCheckResult {
  score: number
  passed: boolean
  issues: GeoIssue[]
}

const MAX_SCORE = 100

/** 有资格承载 NAP 的页面路径（NAP 一致性只在这三处比对） */
const NAP_PATHS = new Set(['/', '/entity', '/visit'])

/** 案例类禁止出现的字段（设计稿 BLOCKS.md：从结构上杜绝，不靠编辑自觉） */
const CASE_FORBIDDEN_KEYS = [
  'patientName',
  'name',
  'patient',
  'efficacy',
  'effect',
  'cureRate',
  'satisfaction',
  'cost',
  'fee',
  'price',
  'beforeAfter',
  'beforeImage',
  'afterImage'
]

/** 禁止字段的中文关键词（防住「换了个键名但值里写了疗效」） */
const CASE_FORBIDDEN_WORDS = ['疗效', '治愈率', '满意度', '痊愈', '根治', '费用', '价格', '收费', '前后对比']

/** 块实例（与页面 blocks 数组元素一致） */
interface CheckBlock {
  key: string
  enabled?: boolean
  data?: Record<string, unknown>
}

/** 遍历块 data 里的全部字符串值（用于 NAP 比对与禁用词扫描） */
function walkStrings(value: unknown, visit: (key: string, text: string) => void, key = ''): void {
  if (typeof value === 'string') {
    visit(key, value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit, key)
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(childValue, visit, childKey)
    }
  }
}

/** 医疗类页面判定：详情类（病种/科普/案例/新闻详情）视为医疗内容，编审信息必填 */
function isMedicalPage(page: { kind?: string | null; path?: string | null }): boolean {
  if (page.kind === 'detail') return true
  const path = page.path || ''
  return ['/diseases', '/cases', '/articles', '/treatments', '/entity'].some((prefix) => path.startsWith(prefix))
}

/**
 * 页面级 GEO 体检
 * @param page 页面字段与块实例
 * @param context 站点上下文（编审/实体声明/NAP 一致性等需要跨页信息）
 */
export function checkPageGeo(
  page: {
    id?: string
    title: string
    path?: string | null
    kind?: string | null
    summary: string | null
    seoTitle: string | null
    seoDescription: string | null
    blocks: CheckBlock[]
    authorName?: string | null
    editorial?: unknown
    jsonLd?: string | null
  },
  context: {
    /** 同站点内重复的路径（canonical 冲突） */
    duplicatePaths?: string[]
    /** 站点 NAP（一致性比对基准） */
    sitePhone?: string | null
    siteAddress?: string | null
    siteLegalName?: string | null
  } = {}
): GeoCheckResult {
  const issues: GeoIssue[] = []
  let score = MAX_SCORE
  const blocks = Array.isArray(page.blocks) ? page.blocks : []

  // ---------- 阻断项 ----------

  if (!page.title) {
    issues.push({ level: 'error', field: 'title', message: '缺少页面标题（渲染为 H1），AI 引擎无法识别主体' })
    score -= 25
  }
  if (!page.seoDescription && !page.summary) {
    issues.push({
      level: 'error',
      field: 'description',
      message: '缺少描述（seoDescription 或 summary），无法生成摘要'
    })
    score -= 20
  }
  if (context.duplicatePaths?.length) {
    issues.push({
      level: 'error',
      field: 'path',
      message: `canonical 冲突：路径 ${context.duplicatePaths.join('、')} 在站点内重复`
    })
    score -= 20
  }

  const editorial = (page.editorial ?? null) as {
    writer?: string
    reviewer?: string
    source?: string
    nextReviewDate?: string
  } | null
  if (isMedicalPage(page) && (!editorial?.writer || !editorial?.reviewer || !editorial?.nextReviewDate)) {
    issues.push({
      level: 'error',
      field: 'editorial',
      message: '医疗类内容缺少编审信息：撰稿人 / 审核医师 / 下次复核日期为必填'
    })
    score -= 25
  }

  /** 案例类禁止字段：按块 key + 键名 + 中文词三重扫描 */
  const caseBlocks = blocks.filter((block) => block.key === 'case-card')
  for (const block of caseBlocks) {
    const data = block.data ?? {}
    const hitKeys = CASE_FORBIDDEN_KEYS.filter(
      (key) => key in data && data[key] !== undefined && data[key] !== null && data[key] !== ''
    )
    const hitWords: string[] = []
    walkStrings(data, (_key, text) => {
      for (const word of CASE_FORBIDDEN_WORDS) {
        if (text.includes(word) && !hitWords.includes(word)) hitWords.push(word)
      }
    })
    if (hitKeys.length || hitWords.length) {
      issues.push({
        level: 'error',
        field: 'blocks.case-card',
        message: `案例出现禁止字段：${[...hitKeys, ...hitWords].join('、')}（姓名 / 疗效 / 费用 / 满意度 / 对比图一律不得录入）`
      })
      score -= 25
    }
  }

  if (!blocks.length) {
    issues.push({ level: 'error', field: 'blocks', message: '页面无结构化 Block 内容' })
    score -= 25
  }

  // ---------- 警告项 ----------

  if (!page.summary) {
    issues.push({ level: 'warn', field: 'summary', message: '缺少摘要，llms.txt 与 meta description 无内容可复用' })
    score -= 8
  }
  if (!page.authorName && !editorial?.writer) {
    issues.push({ level: 'warn', field: 'authorName', message: '缺少作者署名，E-E-A-T 权威性信号偏弱' })
    score -= 8
  }

  /** stat-bar 数字必须有统计口径出处（设计稿硬约束） */
  for (const block of blocks) {
    if (block.key !== 'stat-bar') continue
    const source = block.data?.source
    if (!source || String(source).trim() === '') {
      issues.push({
        level: 'warn',
        field: 'blocks.stat-bar',
        message: '数据条缺少 source（统计口径与统计日期）：无出处的数字宁可不放'
      })
      score -= 10
    }
  }

  /** NAP 一致性：实体档案 / 首页 / 就诊指南三处必须逐字一致 */
  if (page.path && NAP_PATHS.has(page.path)) {
    const phones = new Set<string>()
    const addresses = new Set<string>()
    walkStrings(
      blocks.map((block) => block.data ?? {}),
      (key, text) => {
        if (/^(phone|tel|phoneText)$/i.test(key)) phones.add(text.trim())
        if (/^(address|addressFull)$/i.test(key)) addresses.add(text.trim())
      }
    )
    if (context.sitePhone) {
      for (const value of phones) {
        if (value !== context.sitePhone.trim()) {
          issues.push({
            level: 'warn',
            field: 'nap.phone',
            message: `页面电话「${value}」与站点 NAP「${context.sitePhone}」不一致`
          })
          score -= 8
        }
      }
    }
    if (context.siteAddress) {
      for (const value of addresses) {
        if (value !== context.siteAddress.trim()) {
          issues.push({
            level: 'warn',
            field: 'nap.address',
            message: `页面地址「${value}」与站点 NAP「${context.siteAddress}」不一致`
          })
          score -= 8
        }
      }
    }
  }

  return { score: Math.max(0, score), passed: !issues.some((item) => item.level === 'error'), issues }
}

/**
 * 站点级 GEO 体检（整站发布前跑一次）
 * 关注「站点作为实体是否可被识别」：机构实体声明、llms.txt、robots AI 策略、robots meta、sitemap 核心 URL
 */
export function checkSiteGeo(site: {
  /** 是否存在 /entity 页面且已发布 */
  hasEntityPage: boolean
  /** 实体档案页是否输出了 MedicalClinic 声明 */
  entityDeclaresClinic: boolean
  /** 是否输出 llms.txt */
  hasLlmsTxt: boolean
  /** robots.txt 是否包含 AI 爬虫策略说明 */
  robotsHasAiPolicy: boolean
  /** robots meta 是否开启完整摘要 */
  robotsMetaFullSnippet: boolean
  /** sitemap 是否包含核心 URL（首页 + 一级目录页） */
  sitemapHasCoreUrls: boolean
  /** 站点 NAP 与门诊时间完整性 */
  phone?: string | null
  addressFull?: string | null
  legalName?: string | null
  openingHours?: OpeningHourRule[] | null
}): GeoCheckResult {
  const issues: GeoIssue[] = []
  let score = MAX_SCORE

  if (!site.hasEntityPage || !site.entityDeclaresClinic) {
    issues.push({
      level: 'error',
      field: 'entity',
      message: '缺少机构实体声明：需存在已发布的 /entity 页并输出 MedicalClinic JSON-LD'
    })
    score -= 20
  }
  if (!site.hasLlmsTxt) {
    issues.push({ level: 'error', field: 'llms', message: '缺少 llms.txt（大模型抓取入口）' })
    score -= 15
  }
  if (!site.robotsHasAiPolicy) {
    issues.push({ level: 'error', field: 'robots', message: 'robots.txt 缺少 AI 爬虫策略说明' })
    score -= 15
  }
  if (!site.robotsMetaFullSnippet) {
    issues.push({
      level: 'warn',
      field: 'robotsMeta',
      message: 'robots meta 未开启完整摘要（建议 max-snippet:-1 / max-image-preview:large）'
    })
    score -= 10
  }
  if (!site.sitemapHasCoreUrls) {
    issues.push({ level: 'warn', field: 'sitemap', message: 'sitemap 缺少核心 URL（首页 + 一级目录页）' })
    score -= 10
  }
  if (!site.phone || !site.addressFull || !site.legalName) {
    issues.push({
      level: 'warn',
      field: 'nap',
      message: '站点 NAP 不完整（名称 / 地址 / 电话 任一缺失会降低实体置信度）'
    })
    score -= 10
  }
  if (!site.openingHours || !site.openingHours.length) {
    issues.push({
      level: 'warn',
      field: 'openingHours',
      message: '未配置门诊时间（结构化数据会缺失 openingHoursSpecification）'
    })
    score -= 5
  }

  return { score: Math.max(0, score), passed: !issues.some((item) => item.level === 'error'), issues }
}
