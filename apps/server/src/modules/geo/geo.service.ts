/**
 * GEO 元数据服务（09 §10.3）
 *
 * 提供「只读预览」：`POST /geo/preview`
 *   - 纯计算、**不落盘**、不触发构建
 *   - 返回 `auto`（系统自动生成）与 `output`（按双模式拼接后的实际输出）
 *   - 后台据此提供「以自动结果为基础编辑」与「重新生成」
 *
 * 目标：page-jsonld / entity-jsonld / llms / head / robots-meta
 * 口径与线上产物完全一致——渲染引擎注入的就是这里算出的 `output`。
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  composeGeoDoc,
  resolvePlaceholders,
  type GeoDocMode,
  type GeoPreviewResult,
  type OpeningHourRule
} from '@trillion/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { PublicService } from '../public/public.service'
import { formatDateTime } from '../../common/utils/datetime'
import { checkSiteGeo } from '../../common/utils/geo-check'
import { hasAiCrawlerPolicy, type RobotsPolicy } from '../../config/ai-crawlers'
import {
  buildEntityJsonLd,
  buildPageJsonLd,
  buildRobotsMetaTags,
  sanitizeHeadExtra,
  siteUrl,
  type GeoContext
} from '../../common/utils/geo-docs'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'

/** 预览目标 */
export type GeoPreviewTarget = 'page-jsonld' | 'entity-jsonld' | 'llms' | 'head' | 'robots-meta'

/** 预览入参 */
export interface GeoPreviewInput {
  siteId: string
  target: GeoPreviewTarget
  pageId?: string
  mode?: GeoDocMode
  custom?: string
}

@Injectable()
export class GeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicService: PublicService
  ) {}

  /** 生成预览（纯计算） */
  async preview(user: AuthUser, input: GeoPreviewInput): Promise<GeoPreviewResult> {
    const siteId = input.siteId
    assertSiteAccess(user, siteId)

    const site = await this.prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new NotFoundException('站点不存在')

    const now = formatDateTime(new Date()).slice(0, 10)
    const mode = input.mode ?? this.defaultMode(input.target)
    const custom = input.custom ?? this.defaultCustom(input.target, site)

    const auto = await this.buildAuto(input, site.slug, now)

    return {
      auto,
      /** 输出前统一解析占位符（{{site.*}} / {{page.*}} / {{now:...}}） */
      output: resolvePlaceholders(composeGeoDoc(auto, mode, custom), { now: new Date() })
    }
  }

  /**
   * 站点级 GEO 就绪度体检（09 §10.4 发布前检查清单 / §12.4 验收）
   *
   * 与页面级 `content/pages/:id/geo-check` 的区别：这里看的是「站点作为实体能否被识别」——
   * 机构实体声明、llms.txt、robots AI 策略、robots meta、sitemap 核心 URL、NAP 完整性。
   * 所有判定基于**最终产物文本**（与线上同源），而不是只看配置有没有填。
   */
  async siteCheck(user: AuthUser, siteId: string) {
    const id = siteId
    assertSiteAccess(user, id)

    const site = await this.prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        phone: true,
        contactPhone: true,
        addressFull: true,
        companyAddress: true,
        legalName: true,
        commonName: true,
        name: true,
        openingHours: true,
        robotsPolicy: true,
        robotsMeta: true,
        geoJsonLd: true,
        geoJsonLdMode: true
      }
    })
    if (!site) throw new NotFoundException('站点不存在')

    const [pages, documents] = await Promise.all([
      this.prisma.page.findMany({
        where: { siteId: id, status: 'published' },
        select: { id: true, path: true, slug: true }
      }),
      this.publicService.documents(site.slug)
    ])

    /** 实体档案页：path / slug 命中其一即算（与 PublicService.siteConfig 同一口径） */
    const entityPage = pages.find((page) => page.path === '/entity' || page.slug === 'entity')

    /** 实体档案页最终会输出的 JSON-LD（自动 + 自定义按双模式合成，与线上一致） */
    const entityJsonLd = entityPage
      ? resolvePlaceholders(
          composeGeoDoc(
            await this.buildAuto(
              { siteId: id, target: 'entity-jsonld' },
              site.slug,
              formatDateTime(new Date()).slice(0, 10)
            ),
            (site.geoJsonLdMode as GeoDocMode) ?? 'auto_append',
            site.geoJsonLd ?? ''
          ),
          { now: new Date() }
        )
      : ''

    /** sitemap 里的站内路径集合（绝对 URL → pathname） */
    const sitemapPaths = [...documents.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((item) => {
      try {
        return new URL(item[1]).pathname
      } catch {
        return item[1]
      }
    })

    const robotsMetaTags = buildRobotsMetaTags(site.robotsMeta as never)

    return checkSiteGeo({
      hasEntityPage: Boolean(entityPage),
      entityDeclaresClinic: entityJsonLd.includes('"@type": "MedicalClinic"'),
      hasLlmsTxt: Boolean(documents.llms?.trim()),
      /** 两项同时成立才算：站点显式声明了策略，且产物里确实带可读说明 */
      robotsHasAiPolicy:
        hasAiCrawlerPolicy(site.robotsPolicy as Partial<RobotsPolicy> | null) &&
        /^# 抓取策略说明/m.test(documents.robots),
      robotsMetaFullSnippet: robotsMetaTags.includes('max-snippet:-1'),
      /** 核心 URL = 首页 + 至少一个一级目录页 */
      sitemapHasCoreUrls:
        sitemapPaths.includes('/') &&
        sitemapPaths.some((item) => item !== '/' && item.split('/').filter(Boolean).length === 1),
      phone: site.phone || site.contactPhone || null,
      addressFull: site.addressFull || site.companyAddress || null,
      legalName: site.legalName || site.commonName || site.name || null,
      openingHours: (site.openingHours as unknown as OpeningHourRule[] | null) ?? null
    })
  }

  // ---------------- 内部 ----------------

  /** 缺省模式：一律「自动 + 追加」，保证站点开箱即有合规输出 */
  private defaultMode(target: GeoPreviewTarget): GeoDocMode {
    return target === 'robots-meta' ? 'override' : 'auto_append'
  }

  private defaultCustom(
    target: GeoPreviewTarget,
    site: { geoJsonLd: string | null; llmsTxt: string | null; headExtra: string | null }
  ): string {
    if (target === 'entity-jsonld') return site.geoJsonLd ?? ''
    if (target === 'llms') return site.llmsTxt ?? ''
    if (target === 'head') return site.headExtra ?? ''
    return ''
  }

  /** 组装生成上下文（站点级字段统一来自 PublicService，避免第二套映射） */
  private async buildContext(slug: string, pageId: string | undefined, now: string): Promise<GeoContext> {
    const sitePayload = await this.publicService.siteConfig(slug)
    const context: GeoContext = {
      site: {
        name: sitePayload.name,
        commonName: sitePayload.commonName,
        legalName: sitePayload.legalName,
        abbrName: sitePayload.abbrName || [],
        logoSubtitle: sitePayload.logoSubtitle,
        logoMark: sitePayload.logoMark,
        domain: sitePayload.domain,
        slug: sitePayload.slug,
        icpNumber: sitePayload.icpNumber,
        creditCode: sitePayload.creditCode,
        clinicRegNo: sitePayload.clinicRegNo,
        issuingAuthority: sitePayload.issuingAuthority,
        orgType: sitePayload.orgType,
        level: sitePayload.level,
        legalPerson: sitePayload.legalPerson,
        foundDate: sitePayload.foundDate,
        practiceScopes: sitePayload.practiceScopes || [],
        addressFull: sitePayload.addressFull,
        postalCode: sitePayload.postalCode,
        lat: sitePayload.lat,
        lng: sitePayload.lng,
        phone: sitePayload.phone,
        openingHours: sitePayload.openingHours || [],
        medicalInsurance: sitePayload.medicalInsurance,
        insuranceNo: sitePayload.insuranceNo,
        insuranceNote: sitePayload.insuranceNote,
        sameAs: sitePayload.sameAs || [],
        seoDescription: sitePayload.seoDescription,
        entityPath: sitePayload.entityPath,
        logoUrl: sitePayload.logoUrl,
        pendingFields: sitePayload.pendingFields || []
      },
      now
    }

    if (pageId) {
      const page = await this.publicService.pageDetail(slug, await this.pagePathOrThrow(pageId), {
        includeUnpublished: true
      })
      context.page = {
        id: page.id,
        title: page.title,
        path: page.path,
        kind: page.kind,
        summary: page.summary,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        seoKeywords: page.seoKeywords,
        publishedAt: page.publishedAt ? String(page.publishedAt).slice(0, 10) : null,
        updatedAt: page.updatedAt ? String(page.updatedAt).slice(0, 10) : null,
        authorName: page.authorName,
        editorial: page.editorial,
        blocks: (page.blocks || []).map((block) => ({ key: block.key, data: block.data as Record<string, unknown> }))
      }
      context.channel = page.channel
        ? {
            name: page.channel.name,
            path: page.channel.path,
            ancestors: page.channel.ancestors || []
          }
        : null
    }

    return context
  }

  private async pagePathOrThrow(pageId: string): Promise<string> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { path: true, slug: true }
    })
    if (!page) throw new NotFoundException('页面不存在')
    return page.path || (page.slug === 'home' ? '/' : `/${page.slug}`)
  }

  private async buildAuto(input: GeoPreviewInput, slug: string, now: string): Promise<string> {
    if (input.target === 'llms') {
      return (await this.publicService.documents(slug)).llms
    }

    if (input.target === 'robots-meta') {
      const site = await this.prisma.site.findUnique({
        where: { id: input.siteId },
        select: { robotsMeta: true }
      })
      return buildRobotsMetaTags((site?.robotsMeta as never) ?? null)
    }

    const context = await this.buildContext(slug, input.pageId, now)

    if (input.target === 'entity-jsonld') return buildEntityJsonLd(context)

    if (input.target === 'page-jsonld') {
      if (!input.pageId) throw new BadRequestException('page-jsonld 需要提供 pageId')
      return buildPageJsonLd(context)
    }

    // head：canonical + description + robots meta（自动部分）
    const site = await this.prisma.site.findUnique({
      where: { id: input.siteId },
      select: { robotsMeta: true }
    })
    const lines = [buildRobotsMetaTags((site?.robotsMeta as never) ?? null)]
    if (context.page) {
      lines.push(`<link rel="canonical" href="${siteUrl(context.site.domain, context.page.path)}">`)
      const desc = context.page.seoDescription || context.page.summary
      if (desc) lines.push(`<meta name="description" content="${String(desc).replace(/"/g, '&quot;')}">`)
    }
    return lines.join('\n')
  }

  /** head 扩展净化（落库前调用，禁止脚本与事件属性） */
  sanitizeHead(input: string): string {
    return sanitizeHeadExtra(input)
  }
}
