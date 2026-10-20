/**
 * GEO 元数据生成（09 §10）
 *
 * 分层归属：
 *   块  = 结构（语义化 HTML，由块代码负责）
 *   页面 = JSON-LD（按 kind 与内容特征：Article / WebPage / FAQPage / ItemList）+ canonical + title/description/keywords
 *   站点 = MedicalClinic 实体声明 + llms.txt + robots.txt + robots meta
 *
 * 为什么生成放在服务端而不是渲染引擎：
 *   09 §10.3 要求后台「只读展示实际会输出的内容」。若生成逻辑只在渲染引擎里，
 *   后台预览就得复制一份实现，两份结果必然漂移。因此服务端算、渲染引擎注入，
 *   预览与线上产物共用同一段代码。
 *
 * 纪律：**只输出真实存在的字段**。缺失资质不编造，改为在页面上显式标注「待补」
 *      （pendingFields 由 `detectPendingProfileFields` 给出）。
 */
import type { OpeningHourRule, RobotsMeta, SameAsEntry } from '@trillion/shared'

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

/** 机构实体节点 @id（页面级 JSON-LD 用 @id 引用，避免重复声明实体） */
export function entityId(domain: string, entityPath: string): string {
  return `${siteUrl(domain, entityPath)}#medicalclinic`
}

/**
 * 从页面块里提取 FAQ 问答（FAQPage 结构化数据来源）
 *
 * 支持三种块形态（同一页面可能叠加）：
 *   - `faq-list`   ：{ items: [{ q, a }] }  —— 答案完整可读的问答列表
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

    if (block.key === 'faq-list' || block.key === 'faq-index' || block.key === 'hot-faq') {
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
    ['faq-list', 'faq-detail', 'faq-index', 'hot-faq'].includes(block.key)
  )
  /** 科普 / 新闻正文页含 article-body 块，按文章处理（Article） */
  const hasArticle = context.page.blocks.some((block) => block.key === 'article-body')
  if (context.page.kind === 'list') return hasFaq ? ['CollectionPage', 'FAQPage'] : 'CollectionPage'
  if (context.page.kind === 'detail') {
    if (hasArticle) {
      /** 文章详情：Article 为主节点；含 FAQ 时叠加 FAQPage */
      return hasFaq ? ['Article', 'FAQPage'] : 'Article'
    }
    /** 其余详情（医师 / 项目 / 设备等）按医疗网页处理；含 FAQ 时叠加 FAQPage */
    return hasFaq ? ['MedicalWebPage', 'FAQPage'] : 'MedicalWebPage'
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
    about: { '@id': entityId(domain, context.site.entityPath) },
    publisher: { '@id': entityId(domain, context.site.entityPath) }
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
      worksFor: { '@id': entityId(domain, context.site.entityPath) }
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
    const listKeys = ['post-list', 'doctor-card', 'case-card', 'job-list', 'gallery']
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
 * 机构实体 JSON-LD（MedicalClinic）——只在实体档案页输出
 * 缺失字段直接省略（不编造），page 层会在页面上标注待补清单
 */
export function buildEntityJsonLd(context: GeoContext): string {
  const site = context.site
  const url = siteUrl(site.domain, site.entityPath)

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    '@id': entityId(site.domain, site.entityPath),
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

  /** 门诊时间：逐条转 openingHoursSpecification，不合并、不改写原始口径 */
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

  if (site.practiceScopes.length) node.medicalSpecialty = site.practiceScopes
  if (site.orgType) node.additionalType = site.orgType
  if (site.foundDate) node.foundingDate = site.foundDate
  if (site.legalPerson) node.employee = { '@type': 'Person', name: site.legalPerson, jobTitle: '法定代表人' }
  if (site.medicalInsurance) node.isAcceptingNewPatients = true

  const sameAs = (site.sameAs || []).filter((item) => item?.url).map((item) => item.url)
  if (sameAs.length) node.sameAs = sameAs

  /** 待补字段显式标注：让「未提供」是可见状态，而不是被悄悄省略 */
  if (site.pendingFields?.length) {
    node.disambiguatingDescription = `以下资质字段待医疗机构补充核验：${site.pendingFields.join('、')}`
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
