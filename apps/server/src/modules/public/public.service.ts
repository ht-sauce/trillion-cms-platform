/**
 * 公开数据服务：站点档案、已发布路由、页面详情、站点级 GEO 文档
 *
 * 用途：GEO 项目（渲染引擎）在 SSG 构建期用这些数据驱动 prerender，
 *      在 SSR 运行时用它们实时渲染；后台预览通道亦复用页面详情。
 *
 * 口径要点（09 §5 / §10）：
 *   - 站点 NAP 只在本服务输出一次，页面与块一律**只读引用**，不各自存一份
 *   - 路由条目携带 `contentHash` 与块指纹，构建脚本据此写产物清单（徽标派生的基准）
 *   - 三个站点级文档（robots / sitemap / llms）由 `documents()` 统一产出
 */
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NavigationService } from '../navigation/navigation.service'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import { PUBLIC_BLOCK_SITE_ID, sortPublicFirst } from '../blocks/blocks.service'
import { formatDateTime } from '../../common/utils/datetime'
import {
  composeGeoDoc,
  detectPendingProfileFields,
  resolvePlaceholders,
  type OpeningHourRule,
  type SameAsEntry
} from '@trillion/shared'
import {
  buildSiteLlms,
  buildSiteRobots,
  buildSiteSitemap,
  type SiteDocumentSite
} from '../../common/utils/site-documents'
import {
  buildEntityJsonLd,
  buildPageJsonLd,
  buildRobotsMetaTags,
  sanitizeHeadExtra,
  siteUrl,
  type GeoContext
} from '../../common/utils/geo-docs'

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly navigations: NavigationService
  ) {}

  /** 站点档案 + 导航 + 实体（渲染引擎启动时的一次性装载） */
  async siteConfig(key: string) {
    const site = await this.findSiteByKey(key, true)
    if (!site) throw new NotFoundException('站点不存在或已停用')

    const [entities, navigations, logo, favicon, channels, pages] = await Promise.all([
      this.prisma.entity.findMany({ where: { OR: [{ siteId: site.id }, { siteId: null }] } }),
      this.navigations.resolve(site.id),
      site.logoFileId ? this.prisma.staticFile.findUnique({ where: { id: site.logoFileId } }) : null,
      site.faviconFileId ? this.prisma.staticFile.findUnique({ where: { id: site.faviconFileId } }) : null,
      this.prisma.channel.findMany({
        where: { siteId: site.id },
        select: { id: true, slug: true, path: true, name: true }
      }),
      this.prisma.page.findMany({
        where: { siteId: site.id, status: 'published' },
        select: { id: true, slug: true, path: true, title: true, kind: true }
      })
    ])

    /** 实体档案页路径：NAP 唯一事实来源，供其他页面 JSON-LD 用 @id 引用 */
    const entityPage = pages.find((page) => page.path === '/entity' || page.slug === 'entity')

    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      domain: site.domain,
      renderMode: site.renderMode,
      defaultLocale: site.defaultLocale,

      // ---- 标识 ----
      legalName: site.legalName || site.commonName || site.name,
      commonName: site.commonName || site.name,
      abbrName: (site.abbrName as string[]) || [],
      logoSubtitle: site.logoSubtitle,
      logoMark: site.logoMark,

      // ---- 资质 ----
      clinicRegNo: site.clinicRegNo,
      licenseValidFrom: site.licenseValidFrom,
      licenseValidTo: site.licenseValidTo,
      orgType: site.orgType,
      level: site.level,
      legalPerson: site.legalPerson,
      principal: site.principal,
      foundDate: site.foundDate,
      practiceScopes: (site.practiceScopes as string[]) || [],
      issuingAuthority: site.issuingAuthority,

      // ---- NAP ----
      addressFull: site.addressFull || site.companyAddress,
      postalCode: site.postalCode,
      lat: site.lat,
      lng: site.lng,
      phone: site.phone || site.contactPhone,
      phoneServiceHours: site.phoneServiceHours,

      // ---- 门诊 / 医保 ----
      openingHours: (site.openingHours as unknown as OpeningHourRule[]) || [],
      medicalInsurance: site.medicalInsurance,
      insuranceNo: site.insuranceNo,
      insuranceNote: site.insuranceNote,

      // ---- 关联标识 ----
      sameAs: (site.sameAs as unknown as SameAsEntry[]) || [],

      // ---- 其他 ----
      creditCode: site.creditCode,
      icpNumber: site.icpNumber,
      policeNumber: site.policeNumber,
      contactEmail: site.contactEmail,
      companyName: site.companyName,
      seoTitle: site.seoTitle,
      seoDescription: site.seoDescription,
      seoKeywords: site.seoKeywords,

      /** 站点设计令牌（驱动站点 CSS 变量，与后台主题解耦） */
      themeTokens: (site.themeTokens as Record<string, string>) || {},
      /** robots meta 摘要策略 */
      robotsMeta: site.robotsMeta,
      /** robots meta 标签（按策略生成，渲染引擎直接注入） */
      robotsMetaTags: buildRobotsMetaTags(site.robotsMeta as never),
      /**
       * 机构实体 JSON-LD 最终输出（自动声明 + 自定义内容按双模式合成）
       * 只在实体档案页注入；其他页面用 `@id` 引用，避免同实体多份声明
       */
      entityJsonLd: resolvePlaceholders(
        composeGeoDoc(
          buildEntityJsonLd({
            site: { ...this.toGeoSite(site, logo?.publicUrl ?? null, entityPage?.path || '/entity') },
            now: formatDateTime(new Date()).slice(0, 10)
          }),
          (site.geoJsonLdMode as 'auto_append' | 'override') ?? 'auto_append',
          site.geoJsonLd ?? ''
        ),
        { now: new Date() }
      ),
      /** head 扩展最终输出（净化后注入：禁止 script / 事件属性 / javascript: 协议） */
      headExtra: resolvePlaceholders(
        composeGeoDoc(
          buildRobotsMetaTags(site.robotsMeta as never),
          (site.headExtraMode as 'auto_append' | 'override') ?? 'auto_append',
          sanitizeHeadExtra(site.headExtra ?? '')
        ),
        { now: new Date() }
      ),
      /** 客户资源地址（URL 与存储解耦） */
      logoUrl: logo?.publicUrl ?? null,
      faviconUrl: favicon?.publicUrl ?? null,

      /** 机构实体档案页路径（默认 /entity） */
      entityPath: entityPage?.path || '/entity',
      /** 档案中仍待补的资质字段（缺失时页面显式标注，不编造） */
      pendingFields: detectPendingProfileFields(site),

      navigations,
      entities: entities.map((entity) => ({
        name: entity.name,
        aliases: entity.aliases,
        type: entity.type,
        description: entity.description
      })),

      /** 目录树（面包屑与「全站导览」用） */
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        path: channel.path ?? `/${channel.slug}`
      }))
    }
  }

  /**
   * 已发布页面清单（SSG prerender 的路由来源 + 构建脚本写清单的数据来源）
   * @param onlyIds 仅取这些页面（页面级增量）
   */
  async routes(key: string, onlyIds?: string[]) {
    const site = await this.findSiteByKey(key)
    if (!site) throw new NotFoundException('站点不存在')

    const pages = await this.prisma.page.findMany({
      where: {
        siteId: site.id,
        status: 'published',
        ...(onlyIds?.length ? { id: { in: onlyIds } } : {})
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })

    /**
     * 块代码指纹表（key → codeHash）：构建脚本据此把 blocks[].codeHash 写进产物清单，
     * 后台再按「块代码变更牵连」判定页面徽标（09 §8.2）。
     * 口径与 BlocksService.codeHashMap 保持一致：站点私有块优先覆盖同名公共块；
     * 此处直查而不注入 BlocksService——BlocksModule 已依赖 PublicModule，反向注入会成环。
     */
    const blockDefs = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId: site.id }] },
      select: { key: true, codeHash: true, siteId: true }
    })
    const codeHashMap = new Map<string, string>()
    for (const def of blockDefs.sort(sortPublicFirst)) codeHashMap.set(def.key, def.codeHash)

    return pages.map((page) => ({
      id: page.id,
      path: page.path || (page.slug === 'home' ? '/' : `/${page.slug}`),
      title: page.title,
      slug: page.slug,
      kind: page.kind,
      summary: page.summary,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      /** 页面内容指纹：产物清单的 recorded 值，与 Page.publishedHash 比对得出徽标 */
      contentHash: page.contentHash || '',
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      /** 页面引用的块与代码指纹（构建脚本写入产物清单，用于「块变更牵连」判定） */
      blocks: normalizeBlockInstances(page.blocks).map((item) => ({
        id: item.id,
        key: item.key,
        codeHash: codeHashMap.get(item.key) ?? ''
      }))
    }))
  }

  /**
   * 页面详情（含结构化 Block 与渲染上下文原料）
   * @param options.includeUnpublished 后台预览通道使用：允许取未发布页面（草稿态）
   */
  async pageDetail(key: string, path: string, options: { includeUnpublished?: boolean } = {}) {
    const site = await this.findSiteByKey(key)
    if (!site) throw new NotFoundException('站点不存在')

    const normalizedPath = path === '' || path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`

    const page = await this.prisma.page.findFirst({
      where: {
        siteId: site.id,
        path: normalizedPath,
        ...(options.includeUnpublished ? {} : { status: 'published' })
      }
    })
    if (!page) throw new NotFoundException('页面不存在或未发布')

    const channel = page.channelId ? await this.prisma.channel.findUnique({ where: { id: page.channelId } }) : null
    const ancestors = channel ? await this.channelAncestors(site.id, channel.id) : []

    const [entities, logo] = await Promise.all([
      this.prisma.entity.findMany({ where: { OR: [{ siteId: site.id }, { siteId: null }] } }),
      site.logoFileId ? this.prisma.staticFile.findUnique({ where: { id: site.logoFileId } }) : null
    ])

    const siteConfig = await this.siteConfig(key)
    const instances = await this.hydrateListItems(site.id, site.slug, normalizeBlockInstances(page.blocks))
    const now = formatDateTime(new Date()).slice(0, 10)

    /** 页面级 JSON-LD：服务端算好的最终输出（渲染引擎直接注入，与后台预览同源） */
    const jsonLdAuto = buildPageJsonLd({
      site: this.toGeoSite(site, logo?.publicUrl ?? null, siteConfig.entityPath),
      page: {
        id: page.id,
        title: page.title,
        path: normalizedPath,
        kind: page.kind,
        summary: page.summary,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        seoKeywords: page.seoKeywords,
        publishedAt: page.publishedAt ? String(page.publishedAt).slice(0, 10) : null,
        updatedAt: page.updatedAt ? String(page.updatedAt).slice(0, 10) : null,
        authorName: page.authorName,
        editorial: page.editorial,
        blocks: instances.map((block) => ({ key: block.key, data: block.data as Record<string, unknown> }))
      },
      channel: channel
        ? {
            name: channel.name,
            path: channel.path ?? `/${channel.slug}`,
            ancestors: ancestors
          }
        : null,
      now
    })

    return {
      id: page.id,
      title: page.title,
      slug: page.slug,
      path: normalizedPath,
      /** 绝对规范地址（canonical） */
      canonical: siteUrl(site.domain, normalizedPath),
      kind: page.kind,
      templateId: page.templateId,
      summary: page.summary,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoKeywords: page.seoKeywords,
      /** 自动生成的 JSON-LD（后台只读展示用） */
      jsonLdAuto,
      /** 用户自定义 JSON-LD（页面「双模式」编辑器写入） */
      jsonLdCustom: page.jsonLd,
      jsonLdMode: page.jsonLdMode,
      /** 最终注入页面的 JSON-LD（auto + custom 按模式合成后解析占位符） */
      jsonLd: resolvePlaceholders(
        composeGeoDoc(jsonLdAuto, (page.jsonLdMode as 'auto_append' | 'override') ?? 'auto_append', page.jsonLd ?? ''),
        { now: new Date() }
      ),
      editorial: page.editorial,
      authorName: page.authorName,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      contentHash: page.contentHash || '',
      /** 块实例（统一为 {id,key,enabled,data} 结构） */
      blocks: instances,
      channel: channel
        ? {
            id: channel.id,
            name: channel.name,
            slug: channel.slug,
            path: channel.path ?? `/${channel.slug}`,
            ancestors
          }
        : null,
      entities: entities.map((entity) => ({
        name: entity.name,
        aliases: entity.aliases,
        type: entity.type,
        description: entity.description
      }))
    }
  }

  /** 站点级 GEO 文档（robots / sitemap / llms），构建脚本与「GEO 索引更新」共用 */
  async documents(key: string) {
    const site = await this.findSiteByKey(key)
    if (!site) throw new NotFoundException('站点不存在')

    const [routes, entities] = await Promise.all([this.routes(key), this.entities(key)])
    const now = formatDateTime(new Date()).slice(0, 10)

    /** Prisma 的 Json 列需显式收敛类型，才能交给纯函数生成器 */
    const documentSite = this.toDocumentSite(site)

    const llmsAuto = buildSiteLlms(
      documentSite,
      routes,
      entities.map((entity) => ({ name: entity.name, description: entity.description }))
    )

    return {
      robots: buildSiteRobots(documentSite),
      sitemap: buildSiteSitemap(documentSite, routes, now),
      /** llms.txt 最终输出：自动生成 + 自定义内容按双模式合成（与后台预览同源） */
      llms: resolvePlaceholders(
        composeGeoDoc(llmsAuto, (site.llmsTxtMode as 'auto_append' | 'override') ?? 'auto_append', site.llmsTxt ?? ''),
        { now: new Date() }
      )
    }
  }

  /**
   * 列表块取数（09 §4.4）
   *
   * 块声明里 `dataSource: { kind: 'childPages', channelSlug }` 的块，
   * 数据不在本页录入，而是「该目录下的子页面集合」——在构建期/请求期一次性注入 `items`。
   *
   * 为什么放在服务端而不是块里自己查：
   *   块代码在构建进程里执行，给它数据库访问权等于给任意代码全库读权限（ADR-024 的安全边界）。
   *   因此取数是平台的职责，块只负责渲染 `items`。
   */
  private async hydrateListItems(
    siteId: string,
    slug: string,
    instances: { id: string; key: string; enabled: boolean; data: Record<string, unknown> }[]
  ) {
    /** 先收集需要取数的块，避免每页都为「没有列表块」的情况多查一次库 */
    const declarations = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId }], key: { in: instances.map((item) => item.key) } },
      select: { key: true, declaration: true, siteId: true }
    })
    const declarationByKey = new Map<string, { kind?: string; channelSlug?: string }>()
    // 站点私有块覆盖同名公共块
    for (const item of declarations.sort(sortPublicFirst)) {
      const declaration = (item.declaration ?? {}) as { dataSource?: { kind?: string; channelSlug?: string } }
      if (declaration.dataSource?.kind === 'childPages') {
        declarationByKey.set(item.key, declaration.dataSource)
      }
    }
    if (!declarationByKey.size) return instances

    const channelSlugs = [...new Set([...declarationByKey.values()].map((item) => item.channelSlug).filter(Boolean))]
    if (!channelSlugs.length) return instances

    const channels = await this.prisma.channel.findMany({
      where: { siteId, slug: { in: channelSlugs as string[] } },
      select: { id: true, slug: true, path: true, name: true }
    })
    const channelBySlug = new Map(channels.map((item) => [item.slug, item]))

    /** 逐块取子页面：不同块可能指向不同目录，按需查询 */
    const result: typeof instances = []
    for (const instance of instances) {
      const dataSource = declarationByKey.get(instance.key)
      const channel = dataSource?.channelSlug ? channelBySlug.get(dataSource.channelSlug) : null
      if (!dataSource || !channel) {
        result.push(instance)
        continue
      }

      const children = await this.prisma.page.findMany({
        where: { siteId, channelId: channel.id, status: 'published' },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          slug: true,
          path: true,
          kind: true,
          summary: true,
          publishedAt: true,
          updatedAt: true,
          authorName: true,
          blocks: true
        }
      })

      result.push({
        ...instance,
        data: {
          ...instance.data,
          /** 列表项：标题/路径/摘要 + 首个块的数据（列表卡片的实际内容来源） */
          items: children.map((child) => {
            const blocks = normalizeBlockInstances(child.blocks)
            const first = blocks[0]
            return {
              id: child.id,
              title: child.title,
              slug: child.slug,
              path: child.path,
              kind: child.kind,
              summary: child.summary,
              publishedAt: child.publishedAt,
              updatedAt: child.updatedAt,
              authorName: child.authorName,
              data: first?.data ?? {}
            }
          })
        }
      })
    }
    return result
  }

  /** 站点实体清单（llms.txt 生成用） */
  async entities(key: string) {
    const site = await this.findSiteByKey(key)
    if (!site) throw new NotFoundException('站点不存在')
    return this.prisma.entity.findMany({ where: { OR: [{ siteId: site.id }, { siteId: null }] } })
  }

  /** robots.txt（兼容旧端点，内部委托给统一生成口径） */
  async robots(key: string): Promise<string> {
    const site = await this.findSiteByKey(key)
    if (!site) throw new NotFoundException('站点不存在')
    return buildSiteRobots(this.toDocumentSite(site))
  }

  /** 站点表 → 文档生成器所需的字段（Json 列在此收敛类型） */
  private toDocumentSite(site: {
    name: string
    slug: string
    domain: string
    commonName: string
    legalName: string
    creditCode: string | null
    icpNumber: string | null
    policeNumber: string | null
    phone: string | null
    contactPhone: string | null
    addressFull: string | null
    companyAddress: string | null
    openingHours: unknown
    seoTitle: string | null
    seoDescription: string | null
    robotsPolicy: unknown
  }): SiteDocumentSite {
    return {
      name: site.name,
      slug: site.slug,
      domain: site.domain,
      commonName: site.commonName,
      legalName: site.legalName,
      creditCode: site.creditCode,
      icpNumber: site.icpNumber,
      policeNumber: site.policeNumber,
      phone: site.phone || site.contactPhone,
      addressFull: site.addressFull || site.companyAddress,
      openingHours: (site.openingHours as unknown as OpeningHourRule[]) || [],
      seoTitle: site.seoTitle,
      seoDescription: site.seoDescription,
      robotsPolicy: site.robotsPolicy
    }
  }

  /**
   * 站点标识解析：支持 slug、主域名（Site.domain）与别名域名（SiteDomain.domain）
   * GEO 项目 SSR 运行时按请求 Host 传入域名，多域名映射即在此命中（见 ADR-022）
   */
  private findSiteByKey(key: string, activeOnly = false) {
    return this.prisma.site.findFirst({
      where: {
        OR: [{ slug: key }, { domain: key }, { domains: { some: { domain: key } } }],
        ...(activeOnly ? { status: 'active' } : {})
      }
    })
  }

  /**
   * 站点表 → GEO 生成上下文的站点部分
   * 单独抽出来：站点级实体 JSON-LD 在 `siteConfig` 与 `geo.preview` 两处都要用，必须同一份映射
   */
  private toGeoSite(
    site: {
      name: string
      commonName: string
      legalName: string
      abbrName: unknown
      logoSubtitle: string | null
      logoMark: string | null
      domain: string
      slug: string
      icpNumber: string | null
      creditCode: string | null
      clinicRegNo: string | null
      issuingAuthority: string | null
      orgType: string | null
      level: string | null
      legalPerson: string | null
      foundDate: string | null
      practiceScopes: unknown
      addressFull: string | null
      companyAddress: string | null
      postalCode: string | null
      lat: string | null
      lng: string | null
      phone: string | null
      contactPhone: string | null
      openingHours: unknown
      medicalInsurance: boolean
      insuranceNo: string | null
      insuranceNote: string | null
      sameAs: unknown
      seoDescription: string | null
    },
    logoUrl: string | null,
    entityPath: string
  ): GeoContext['site'] {
    return {
      name: site.name,
      commonName: site.commonName || site.name,
      legalName: site.legalName || site.commonName || site.name,
      abbrName: (site.abbrName as string[]) || [],
      logoSubtitle: site.logoSubtitle,
      logoMark: site.logoMark,
      domain: site.domain,
      slug: site.slug,
      icpNumber: site.icpNumber,
      creditCode: site.creditCode,
      clinicRegNo: site.clinicRegNo,
      issuingAuthority: site.issuingAuthority,
      orgType: site.orgType,
      level: site.level,
      legalPerson: site.legalPerson,
      foundDate: site.foundDate,
      practiceScopes: (site.practiceScopes as string[]) || [],
      addressFull: site.addressFull || site.companyAddress,
      postalCode: site.postalCode,
      lat: site.lat,
      lng: site.lng,
      phone: site.phone || site.contactPhone,
      openingHours: (site.openingHours as unknown as OpeningHourRule[]) || [],
      medicalInsurance: site.medicalInsurance,
      insuranceNo: site.insuranceNo,
      insuranceNote: site.insuranceNote,
      sameAs: (site.sameAs as SameAsEntry[]) || [],
      seoDescription: site.seoDescription,
      entityPath,
      logoUrl,
      pendingFields: detectPendingProfileFields(site)
    }
  }

  /** 目录祖先链（自根到当前，面包屑用） */
  private async channelAncestors(siteId: string, channelId: string) {
    const all = await this.prisma.channel.findMany({
      where: { siteId },
      select: { id: true, name: true, slug: true, path: true, parentId: true }
    })
    const byId = new Map(all.map((item) => [item.id, item]))
    const chain: { id: string; name: string; slug: string; path: string }[] = []

    let cursor = byId.get(channelId)?.parentId ?? null
    let guard = 0
    while (cursor && guard < 20) {
      const node = byId.get(cursor)
      if (!node) break
      chain.unshift({ id: node.id, name: node.name, slug: node.slug, path: node.path ?? `/${node.slug}` })
      cursor = node.parentId
      guard += 1
    }
    return chain
  }
}
