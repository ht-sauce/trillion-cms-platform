/**
 * GEO 元数据生成（09 §10）
 *
 * 分层归属：
 *   块  = 结构（语义化 HTML，由块代码负责）
 *   页面 = JSON-LD（按 kind 与内容特征：Article / WebPage / FAQPage / ItemList）+ canonical + title/description/keywords
 *   站点 = 机构实体声明（按行业类型）+ llms.txt + robots.txt + robots meta
 *
 * 为什么生成放在服务端而不是渲染引擎：
 *   09 §10.3 要求后台「只读展示实际会输出的内容」。若生成逻辑只在渲染引擎里，
 *   后台预览就得复制一份实现，两份结果必然漂移。因此服务端算、渲染引擎注入，
 *   预览与线上产物共用同一段代码。
 *
 * 纪律：**只输出真实存在的字段**。缺失资质不编造，改为在页面上显式标注「待补」
 *      （pendingFields 由 `detectPendingProfileFields` 给出）。
 *
 * 行业适配（ADR-046）：平台原先只承接医疗机构，实体与页面类型硬编码为 MedicalClinic /
 *   MedicalWebPage。工业与工程类站点（地坪、装饰、机电安装）必须声明为企业实体，
 *   否则结构化数据与实际业务主体不符，属于「自相矛盾的实体声明」，对 GEO 是负信号。
 *   因此按 `Site.businessType` 分派 ENTITY_PROFILE，医疗口径保持逐字节不变。
 */
import type { OpeningHourRule, RobotsMeta, SameAsEntry } from '@trillion/shared'

/** 行业类型：驱动实体类型、页面主节点类型与待补字段文案 */
export type BusinessType = 'medical' | 'industrial'

/**
 * 行业 → 结构化数据口径
 *
 * `entityType` 为 schema.org 类型（可多类型，机器读时会展开成 @type 数组）；
 * `entityIdSuffix` 进 @id 片段，**医疗必须保持 medicalclinic**，
 * 否则已上线站点的实体引用会全部失效（其他页面的 `about` / `publisher` 指向它）。
 */
const ENTITY_PROFILE = {
  medical: {
    entityType: 'MedicalClinic' as string | string[],
    entityIdSuffix: 'medicalclinic',
    /** detail 页（项目/设备/医师等非文章详情）的主节点类型 */
    detailPageType: 'MedicalWebPage',
    pendingLabel: '以下资质字段待医疗机构补充核验'
  },
  industrial: {
    /** 施工承包类企业：Organization 说明主体，GeneralContractor 说明业态（LocalBusiness 子类，可用地址/营业时间） */
    entityType: ['Organization', 'GeneralContractor'] as string | string[],
    entityIdSuffix: 'organization',
    detailPageType: 'WebPage',
    pendingLabel: '以下企业信息待补充核验'
  }
} satisfies Record<BusinessType, unknown>

/** 取行业口径（未知值一律按医疗处理，保证历史数据不变） */
function profileOf(businessType?: string | null) {
  return businessType === 'industrial' ? ENTITY_PROFILE.industrial : ENTITY_PROFILE.medical
}

/** 生成上下文：站点 + 页面（页面为可选，站点级文档不需要） */
export interface GeoContext {
  site: {
    name: string
    commonName: string
    legalName: string
    abbrName: string[]
    logoSubtitle?: string | null
    logoMark?: string | null
    domain: string
    slug: string
    icpNumber: string | null
    creditCode: string | null
    clinicRegNo: string | null
    issuingAuthority?: string | null
    orgType: string | null
    level: string | null
    legalPerson: string | null
    foundDate: string | null
    practiceScopes: string[]
    addressFull: string | null
    postalCode: string | null
    lat: string | null
    lng: string | null
    phone: string | null
    openingHours: OpeningHourRule[]
    medicalInsurance: boolean
    insuranceNo: string | null
    insuranceNote?: string | null
    sameAs: SameAsEntry[]
    seoDescription: string | null
    entityPath: string
    logoUrl?: string | null
    pendingFields?: string[]
    /** 行业类型（medical / industrial），缺省 medical；见 ENTITY_PROFILE */
    businessType?: string | null
  }
  page?: {
    id: string
    title: string
    path: string
    kind: string
    summary: string | null
    seoTitle: string | null
    seoDescription: string | null
    seoKeywords: string | null
    publishedAt: string | null
    updatedAt: string | null
    authorName: string | null
    editorial?: unknown
    blocks: { key: string; data?: Record<string, unknown> }[]
  }
  channel?: { name: string; path: string; ancestors: { name: string; path: string }[] } | null
  /** 基准时间（YYYY-MM-DD） */
  now: string
}

/** 站点绝对地址 */
export function siteUrl(domain: string, path = '/'): string {
  const clean = String(domain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const p = path === '/' ? '/' : `/${String(path).replace(/^\/+|\/+$/g, '')}`
  return `https://${clean}${p}`
}

/**
 * 机构实体节点 @id（页面级 JSON-LD 用 @id 引用，避免重复声明实体）
 *
 * 片段后缀随行业变化（medicalclinic / organization）：同一域名下若并存两种业态的站点，
 * @id 必须是不同的节点，否则会互相覆盖成同一个实体。
 */
export function entityId(domain: string, entityPath: string, businessType?: string | null): string {
  return `${siteUrl(domain, entityPath)}#${profileOf(businessType).entityIdSuffix}`
}

/**
 * 从页面块里提取 FAQ 问答（FAQPage 结构化数据来源）
 *
 * 支持三种块形态（同一页面可能叠加）：
 *   - `faq-list`   ：{ items: [{ q, a }] }  —— 答案完整可读的问答列表
 *   - `faq-board`  ：{ items: [{ cat, q, a, href }] } —— 分类页签 + 搜索 + 分页的全量问答
 *   - `faq-detail` ：{ question, paragraphs } —— 问答详情页（问题 + 分点答案）
 *   - `faq-index` / `hot-faq`：{ items: [{ q, a }] } —— 列表页的问答索引（答案给摘要）
 * 详情页与列表页都可能成为 FAQPage 的载体，因此不能只认 `faq-list`。
 */
function collectFaq(blocks: { key: string; data?: Record<string, unknown> }[]) {
  const questions: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[] = []

  for (const block of blocks) {
    const data = (block.data || {}) as Record<string, unknown>

    if (block.key === 'faq-detail') {
      const q = typeof data.question === 'string' ? data.question : ''
      const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : []
      const text = paragraphs.filter((p): p is string => typeof p === 'string').join('\n\n')
      if (q && text) {
        questions.push({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text } })
      }
      continue
    }

    if (block.key === 'faq-list' || block.key === 'faq-board' || block.key === 'faq-index' || block.key === 'hot-faq') {
      const items = (data.items || []) as { q?: string; a?: string }[]
      for (const item of items) {
        if (item?.q && item?.a) {
          questions.push({
            '@type': 'Question',
            name: String(item.q),
            acceptedAnswer: { '@type': 'Answer', text: String(item.a) }
          })
        }
      }
    }
  }

  /** 同一问题去重（列表页分组渲染时可能重复出现） */
  const seen = new Set<string>()
  return questions.filter((item) => (seen.has(item.name) ? false : (seen.add(item.name), true)))
}

/** 面包屑节点（首页 → 祖先目录 → 当前页） */
function breadcrumbNode(context: GeoContext) {
  if (!context.page) return null
  const items: { name: string; item: string }[] = [{ name: '首页', item: siteUrl(context.site.domain, '/') }]
  for (const ancestor of context.channel?.ancestors ?? []) {
    items.push({ name: ancestor.name, item: siteUrl(context.site.domain, ancestor.path) })
  }
  if (context.channel && context.page.path !== context.channel.path) {
    items.push({ name: context.channel.name, item: siteUrl(context.site.domain, context.channel.path) })
  }
  if (context.page.path !== '/') {
    items.push({ name: context.page.title, item: siteUrl(context.site.domain, context.page.path) })
  }
  if (items.length < 2) return null

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item
    }))
  }
}

/** 页面主节点类型：按 kind 与内容特征判定 */
function pageNodeType(context: GeoContext): string | string[] {
  if (!context.page) return 'WebPage'
  const hasFaq = context.page.blocks.some((block) =>
    ['faq-list', 'faq-board', 'faq-detail', 'faq-index', 'hot-faq'].includes(block.key)
  )
  /** 科普 / 新闻正文页含 article-body 块，按文章处理（Article） */
  const hasArticle = context.page.blocks.some((block) => block.key === 'article-body')
  if (context.page.kind === 'list') return hasFaq ? ['CollectionPage', 'FAQPage'] : 'CollectionPage'
  if (context.page.kind === 'detail') {
    if (hasArticle) {
      /** 文章详情：Article 为主节点；含 FAQ 时叠加 FAQPage */
      return hasFaq ? ['Article', 'FAQPage'] : 'Article'
    }
    /** 其余详情（医疗：医师 / 项目 / 设备；工业：产品 / 案例）按行业口径处理；含 FAQ 时叠加 FAQPage */
    const detailType = profileOf(context.site.businessType).detailPageType
    return hasFaq ? [detailType, 'FAQPage'] : detailType
  }
  return hasFaq ? ['WebPage', 'FAQPage'] : 'WebPage'
}

/**
 * 页面级 JSON-LD（@graph：主节点 + 面包屑 + FAQ + 实体引用）
 * 实体本身只在 /entity 页声明，这里用 @id 指向，避免同一实体多份声明
 */
export function buildPageJsonLd(context: GeoContext): string {
  if (!context.page) return ''
  const domain = context.site.domain
  const url = siteUrl(domain, context.page.path)
  const type = pageNodeType(context)

  const mainNode: Record<string, unknown> = {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: context.page.seoTitle || context.page.title,
    description: context.page.seoDescription || context.page.summary || context.site.seoDescription || '',
    inLanguage: 'zh-CN',
    isPartOf: { '@type': 'WebSite', '@id': `${siteUrl(domain, '/')}#website`, name: context.site.commonName },
    about: { '@id': entityId(domain, context.site.entityPath, context.site.businessType) },
    publisher: { '@id': entityId(domain, context.site.entityPath, context.site.businessType) }
  }
  if (context.page.publishedAt) mainNode.datePublished = String(context.page.publishedAt).slice(0, 10)
  if (context.page.updatedAt) mainNode.dateModified = String(context.page.updatedAt).slice(0, 10)
  if (context.page.authorName) mainNode.author = { '@type': 'Person', name: context.page.authorName }

  /** 编审信息（医疗类内容）：作为 reviewedBy / citation 输出，强化可核验性 */
  const editorial = context.page.editorial as {
    reviewer?: string
    writer?: string
    source?: string
    /** 医师详情页：把执业信息声明为 Physician 实体（GEO 可核验信号） */
    physician?: {
      name?: string
      jobTitle?: string
      medicalSpecialty?: string
      registrationNumber?: string
      worksFor?: string
    }
  } | null
  if (editorial?.reviewer) mainNode.reviewedBy = { '@type': 'Person', name: editorial.reviewer }
  if (editorial?.source) mainNode.citation = editorial.source

  const graph: Record<string, unknown>[] = [mainNode]

  /** 医师详情页：声明 Physician 实体，并在主节点用 author / about 关联 */
  const ph = editorial?.physician
  if (ph?.name) {
    const physician: Record<string, unknown> = {
      '@type': 'Physician',
      '@id': `${url}#physician`,
      name: ph.name,
      worksFor: { '@id': entityId(domain, context.site.entityPath, context.site.businessType) }
    }
    if (ph.jobTitle) physician.jobTitle = ph.jobTitle
    if (ph.medicalSpecialty) physician.medicalSpecialty = ph.medicalSpecialty
    if (ph.registrationNumber) {
      physician.identifier = {
        '@type': 'PropertyValue',
        name: '执业证书编号',
        value: ph.registrationNumber
      }
    }
    graph.push(physician)
    mainNode.about = { '@id': `${url}#physician` }
    mainNode.author = { '@id': `${url}#physician` }
  }

  /** 列表页输出 ItemList（集合语义） */
  if (context.page.kind === 'list') {
    const listKeys = [
      'post-list',
      'doctor-card',
      'case-card',
      'job-list',
      'gallery',
      'product-card',
      'case-grid',
      'cert-grid'
    ]
    const listBlock = context.page.blocks.find((block) => listKeys.includes(block.key))
    const items = (listBlock?.data?.items || listBlock?.data?.list || []) as unknown[]
    if (Array.isArray(items) && items.length) {
      graph.push({
        '@type': 'ItemList',
        '@id': `${url}#list`,
        numberOfItems: items.length,
        itemListElement: items.slice(0, 50).map((item, index) => {
          const record = item as Record<string, unknown>
          return {
            '@type': 'ListItem',
            position: index + 1,
            name: String(record.title || record.name || record.q || `条目 ${index + 1}`)
          }
        })
      })
    }
  }

  const breadcrumb = breadcrumbNode(context)
  if (breadcrumb) graph.push(breadcrumb)

  const questions = collectFaq(context.page.blocks)
  if (questions.length) {
    graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: questions })
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
}

/**
 * 机构实体 JSON-LD（医疗：MedicalClinic / 工业：Organization + GeneralContractor）
 * 只在实体档案页输出。缺失字段直接省略（不编造），page 层会在页面上标注待补清单。
 *
 * 医疗与工业共用同一批站点字段，但**语义映射不同**：
 *   - `practiceScopes`：医疗是「诊疗科目」→ medicalSpecialty；工业是「服务范围」→ knowsAbout
 *   - `orgType`：医疗是「机构类型」→ additionalType；工业不放（避免把「有限责任公司」当业务类型）
 *   - `clinicRegNo` / `insuranceNo`：仅医疗输出，工业站没有这两项，输出等于编造
 */
export function buildEntityJsonLd(context: GeoContext): string {
  const site = context.site
  const url = siteUrl(site.domain, site.entityPath)
  const profile = profileOf(site.businessType)
  const isMedical = site.businessType !== 'industrial'

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': profile.entityType,
    '@id': entityId(site.domain, site.entityPath, site.businessType),
    url,
    name: site.commonName || site.name,
    /** 对外唯一名称口径；工商全称作为 legalName，避免与 name 冲突 */
    legalName: site.legalName || site.commonName || site.name,
    inLanguage: 'zh-CN'
  }

  if (site.abbrName.length) node.alternateName = site.abbrName
  if (site.logoUrl) node.logo = siteUrl(site.domain, site.logoUrl)
  if (site.seoDescription) node.description = site.seoDescription

  const identifiers: Record<string, unknown>[] = []
  if (site.creditCode) {
    identifiers.push({ '@type': 'PropertyValue', name: '统一社会信用代码', value: site.creditCode })
  }
  if (site.clinicRegNo) {
    identifiers.push({ '@type': 'PropertyValue', name: '医疗机构登记号', value: site.clinicRegNo })
  }
  if (site.insuranceNo) {
    identifiers.push({ '@type': 'PropertyValue', name: '医保定点编号', value: site.insuranceNo })
  }
  if (identifiers.length) node.identifier = identifiers

  if (site.addressFull) {
    node.address = {
      '@type': 'PostalAddress',
      '@id': `${url}#address`,
      streetAddress: site.addressFull,
      addressCountry: 'CN',
      ...(site.postalCode ? { postalCode: site.postalCode } : {})
    }
  }
  if (site.phone) node.telephone = site.phone
  if (site.lat && site.lng) {
    node.geo = { '@type': 'GeoCoordinates', latitude: site.lat, longitude: site.lng }
  }

  /** 营业/门诊时间：逐条转 openingHoursSpecification，不合并、不改写原始口径 */
  const hours = (site.openingHours || []).filter((rule) => rule?.open && rule?.close)
  if (hours.length) {
    node.openingHoursSpecification = hours.map((rule) => ({
      '@type': 'OpeningHoursSpecification',
      ...(rule.weekday ? { dayOfWeek: rule.weekday } : {}),
      opens: rule.open,
      closes: rule.close,
      ...(rule.note ? { description: rule.note } : {})
    }))
  }

  if (isMedical) {
    if (site.practiceScopes.length) node.medicalSpecialty = site.practiceScopes
    if (site.orgType) node.additionalType = site.orgType
    if (site.medicalInsurance) node.isAcceptingNewPatients = true
  } else {
    /** 工业/工程：服务范围即企业专业领域，用 knowsAbout 表达（schema.org Organization 属性） */
    if (site.practiceScopes.length) node.knowsAbout = site.practiceScopes
  }
  if (site.foundDate) node.foundingDate = site.foundDate
  if (site.legalPerson) node.employee = { '@type': 'Person', name: site.legalPerson, jobTitle: '法定代表人' }

  const sameAs = (site.sameAs || []).filter((item) => item?.url).map((item) => item.url)
  if (sameAs.length) node.sameAs = sameAs

  /**
   * 待补字段显式标注（按行业分派，ADR-050）：
   *   医疗 —— 有资质披露义务，「未提供」必须是可见状态，不悄悄省略；
   *   工业 —— 无披露义务，且站点口径是「按实际站点呈现」，缺失字段本来就不输出，
   *           再写 disambiguatingDescription 等于在机器可读层自曝缺失，
   *           对实体置信度是负贡献，因此不输出。
   */
  if (context.site.businessType !== 'industrial' && site.pendingFields?.length) {
    node.disambiguatingDescription = `${profile.pendingLabel}：${site.pendingFields.join('、')}`
  }

  return JSON.stringify(node, null, 2)
}

/**
 * head 扩展净化（白名单）
 * 只放行 meta / link；剔除 script / 事件属性 / javascript: 协议，
 * 保证「head 扩展」不会被用来往站点注入可执行代码（09 §10.3）。
 */
export function sanitizeHeadExtra(input: string): string {
  if (!input) return ''
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>]*/gi, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^<(meta|link)\b/i.test(line))
    .join('\n')
}

/** robots meta 标签（默认开启完整摘要：max-snippet:-1 / max-image-preview:large） */
export function buildRobotsMetaTags(meta?: Partial<RobotsMeta> | null): string {
  const value: Required<RobotsMeta> = {
    index: meta?.index ?? true,
    follow: meta?.follow ?? true,
    maxSnippet: meta?.maxSnippet ?? -1,
    maxImagePreview: meta?.maxImagePreview ?? 'large',
    maxVideoPreview: meta?.maxVideoPreview ?? -1
  }
  const parts = [
    value.index ? 'index' : 'noindex',
    value.follow ? 'follow' : 'nofollow',
    `max-snippet:${value.maxSnippet}`,
    `max-image-preview:${value.maxImagePreview}`,
    `max-video-preview:${value.maxVideoPreview}`
  ]
  return `<meta name="robots" content="${parts.join(',')}">`
}
