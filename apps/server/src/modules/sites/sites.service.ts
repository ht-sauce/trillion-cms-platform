/**
 * 站点服务：站点 CRUD + 站点与静态文件（Logo/营业执照）的引用解析
 * 域名模型：Site.domain 是主域名（规范地址，SEO/预览用它），SiteDomain 存别名域名（多域名映射，见 ADR-022）
 * 数据权限：站点管理员仅可见自己授权的站点
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { siteWhere } from '../../common/utils/site-scope'
import { normalizePage, normalizePageSize } from '../../common/constants'
import { fromJson, toJsonInput } from '../../common/utils/json'
import { formatDateTime } from '../../common/utils/datetime'
import { PublishService, type BuildTaskBrief } from '../publish/publish.service'
import { AI_CRAWLER_DEFAULTS, SITE_DEFAULTS } from './constants'
import type { CreateSiteDto, QuerySiteDto, UpdateSiteDto } from './dto'

/**
 * 站点表中以 Json 列存储的字段
 * Prisma 对 Json 列要求 InputJsonValue，直接把数组/对象塞进 update 会报错，
 * 因此统一在这里声明、在写入前集中转换（新增 Json 字段只需改这一处）
 */
const JSON_FIELDS = [
  'robotsPolicy',
  'themeConfig',
  'abbrName',
  'practiceScopes',
  'openingHours',
  'sameAs',
  'themeTokens',
  'robotsMeta'
] as const

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    /** 站点列表/详情要带「构建状态」，状态口径唯一实现在发布服务（06 §1.1） */
    private readonly publish: PublishService
  ) {}

  /** 站点列表（分页 + 关键字 + 模式/状态筛选） */
  async list(user: AuthUser, query: QuerySiteDto) {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const where: Record<string, unknown> = siteWhere(user)

    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword } },
        { slug: { contains: query.keyword } },
        { domain: { contains: query.keyword } },
        { companyName: { contains: query.keyword } },
        /** 关键字同时匹配别名域名（多域名映射） */
        { domains: { some: { domain: { contains: query.keyword } } } }
      ]
    }
    if (query.renderMode) where.renderMode = query.renderMode
    if (query.status) where.status = query.status

    const [list, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
        include: { domains: { select: { domain: true }, orderBy: { id: 'asc' } } }
      }),
      this.prisma.site.count({ where })
    ])

    /** 构建状态：一次批量取每站最新任务，避免逐行查询（列表「构建状态」列的数据来源） */
    const buildMap = await this.publish.latestTaskBySites(list.map((item) => item.id))

    return {
      list: list.map((item) => this.toView(item, buildMap.get(item.id) ?? null)),
      total,
      page,
      pageSize
    }
  }

  /** 站点详情 */
  async detail(user: AuthUser, id: string) {
    const site = await this.prisma.site.findUnique({
      where: { id },
      include: { domains: { select: { domain: true }, orderBy: { id: 'asc' } } }
    })
    if (!site) throw new NotFoundException('站点不存在')
    if (!user.platform) siteWhere(user, site.id)
    return this.toView(await this.withFiles(site), await this.publish.latestTask(site.id))
  }

  /** 新建站点（仅平台管理员）；别名域名与站点一次性写入 */
  async create(dto: CreateSiteDto) {
    const { domains: aliasDomains, ...rest } = dto
    const aliases = await this.normalizeDomains(rest.domain, aliasDomains)
    await this.assertMainDomainAvailable(rest.domain)
    const payload = this.toWritePayload(rest)

    const created = await this.prisma.site.create({
      data: {
        ...payload,
        name: rest.name,
        slug: rest.slug,
        domain: rest.domain,
        companyName: rest.companyName,
        creditCode: rest.creditCode,
        companyAddress: rest.companyAddress,
        contactPhone: rest.contactPhone,
        contactEmail: rest.contactEmail,
        icpNumber: rest.icpNumber,
        policeNumber: rest.policeNumber,
        businessLicenseFileId: rest.businessLicenseFileId,
        logoFileId: rest.logoFileId,
        faviconFileId: rest.faviconFileId,
        seoTitle: rest.seoTitle,
        seoDescription: rest.seoDescription,
        seoKeywords: rest.seoKeywords,
        defaultLocale: rest.defaultLocale || SITE_DEFAULTS.locale,
        robotsPolicy: toJsonInput(rest.robotsPolicy ?? AI_CRAWLER_DEFAULTS),
        renderMode: rest.renderMode || SITE_DEFAULTS.renderMode,
        themeConfig: toJsonInput(rest.themeConfig ?? SITE_DEFAULTS.theme),
        status: rest.status || SITE_DEFAULTS.status,
        ...(aliases.length ? { domains: { create: aliases.map((domain) => ({ domain })) } } : {})
      },
      include: { domains: { select: { domain: true }, orderBy: { id: 'asc' } } }
    })
    /** 新建站点必然还没有构建任务 */
    return this.toView(created, null)
  }

  /** 更新站点（仅平台管理员）；`domains` 为全量替换（不传表示不动别名域名） */
  async update(id: string, dto: UpdateSiteDto) {
    const exists = await this.prisma.site.findUnique({ where: { id }, select: { id: true, domain: true } })
    if (!exists) throw new NotFoundException('站点不存在')

    const { domains: aliasDomains, ...rest } = dto
    const data: Record<string, unknown> = this.toWritePayload(rest)
    const mainChanged = Boolean(rest.domain && rest.domain !== exists.domain)
    if (mainChanged) await this.assertMainDomainAvailable(rest.domain as string, id)

    const aliasOps: Record<string, unknown> = {}
    if (aliasDomains !== undefined) {
      const aliases = await this.normalizeDomains(rest.domain ?? exists.domain, aliasDomains, id)
      /** 先清空再写入：别名域名数量少，全量替换比 diff 更直观 */
      aliasOps.deleteMany = {}
      aliasOps.create = aliases.map((domain) => ({ domain }))
    } else if (mainChanged) {
      /** 原别名升级为主域名：从别名表移除，避免同一域名既是主域名又是别名 */
      aliasOps.deleteMany = { domain: rest.domain }
    }
    if (Object.keys(aliasOps).length) data.domains = aliasOps

    const updated = await this.prisma.site.update({
      where: { id },
      data: data as never,
      include: { domains: { select: { domain: true }, orderBy: { id: 'asc' } } }
    })
    return this.toView(updated, await this.publish.latestTask(id))
  }

  /** 删除站点（仅平台管理员）；别名域名由外键 ON DELETE CASCADE 级联清理 */
  async remove(id: string) {
    await this.prisma.site.delete({ where: { id } })
    return { id }
  }

  /**
   * DTO → Prisma 写入载荷：Json 列转换 + 去掉未传值的字段
   * 「未传值不覆盖」是关键语义：更新接口是 PATCH，运营只改门诊时间时不该把 NAP 清空
   */
  private toWritePayload(rest: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue
      payload[key] = JSON_FIELDS.includes(key as (typeof JSON_FIELDS)[number]) ? toJsonInput(value) : value
    }
    return payload
  }

  /**
   * 别名域名规范化与唯一性校验
   * - 去空格 / 去空值 / 去重（同一次提交内的重复直接折叠）
   * - 不允许与本站点主域名相同
   * - 不允许与任何站点的主域名或其他别名域名重复（编辑时排除自身，excludeSiteId）
   */
  private async normalizeDomains(mainDomain: string, domains: string[] | undefined, excludeSiteId?: string) {
    const aliases = [...new Set((domains ?? []).map((item) => item.trim()).filter(Boolean))]
    if (!aliases.length) return aliases

    if (aliases.includes(mainDomain)) throw new BadRequestException('别名域名不能与主域名相同')

    const [mainHit, aliasHit] = await Promise.all([
      this.prisma.site.findFirst({
        where: { domain: { in: aliases }, ...(excludeSiteId ? { id: { not: excludeSiteId } } : {}) },
        select: { domain: true }
      }),
      this.prisma.siteDomain.findFirst({
        where: { domain: { in: aliases }, ...(excludeSiteId ? { siteId: { not: excludeSiteId } } : {}) },
        select: { domain: true }
      })
    ])

    const conflict = mainHit?.domain ?? aliasHit?.domain
    if (conflict) throw new BadRequestException(`域名「${conflict}」已被其他站点使用`)
    return aliases
  }

  /** 主域名唯一性：不得与其他站点的主域名或别名域名重复（`Site.domain` 无数据库唯一约束，靠此处兜底） */
  private async assertMainDomainAvailable(domain: string, excludeSiteId?: string) {
    const target = domain.trim()
    const [mainHit, aliasHit] = await Promise.all([
      this.prisma.site.findFirst({
        where: { domain: target, ...(excludeSiteId ? { id: { not: excludeSiteId } } : {}) },
        select: { domain: true }
      }),
      this.prisma.siteDomain.findFirst({
        where: { domain: target, ...(excludeSiteId ? { siteId: { not: excludeSiteId } } : {}) },
        select: { domain: true }
      })
    ])
    if (mainHit || aliasHit) throw new BadRequestException(`主域名「${target}」已被其他站点使用`)
  }

  /** 附加 Logo/执照等文件 URL（避免前端二次请求） */
  private async withFiles(site: Record<string, any>) {
    const ids = [site.businessLicenseFileId, site.logoFileId, site.faviconFileId].filter(Boolean) as string[]
    if (!ids.length) return site
    const files = await this.prisma.staticFile.findMany({ where: { id: { in: ids } } })
    const map = new Map(files.map((f) => [f.id, f]))
    return {
      ...site,
      businessLicenseUrl: site.businessLicenseFileId ? (map.get(site.businessLicenseFileId)?.publicUrl ?? null) : null,
      logoUrl: site.logoFileId ? (map.get(site.logoFileId)?.publicUrl ?? null) : null,
      faviconUrl: site.faviconFileId ? (map.get(site.faviconFileId)?.publicUrl ?? null) : null
    }
  }

  /**
   * 统一对外视图：JSON 字段转对象、别名域名扁平为 string[]、时间转字符串（YYYY-MM-DD HH:mm:ss）
   * @param build 最新构建任务摘要（null = 从未构建）；站点列表「构建状态」列与编辑器按钮锁定都用它
   */
  private toView(site: Record<string, any>, build: BuildTaskBrief | null) {
    const { createdAt, updatedAt, robotsPolicy, themeConfig, domains, ...rest } = site
    return {
      ...rest,
      build,
      /** 别名域名（不含主域名 domain）：数据库侧是 SiteDomain 记录，对外统一为字符串数组 */
      domains: Array.isArray(domains) ? (domains as Array<{ domain: string }>).map((item) => item.domain) : [],
      robotsPolicy: fromJson(robotsPolicy, AI_CRAWLER_DEFAULTS) as unknown as Record<string, unknown>,
      themeConfig: fromJson(themeConfig, SITE_DEFAULTS.theme) as unknown as Record<string, unknown>,
      createdAt: formatDateTime(createdAt),
      updatedAt: formatDateTime(updatedAt)
    }
  }
}
