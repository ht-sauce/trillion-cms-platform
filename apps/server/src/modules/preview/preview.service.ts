/**
 * 预览票据服务（09 §7.5）
 *
 * 设计取舍：**无状态 HMAC 签名票据**，而不是服务端存一张票据表。
 *   - 短时效（默认 30 分钟）、只绑定单个 pageId、只读、不能触发构建
 *   - 无状态 → 服务重启后票据仍有效（不会出现「刷新后台就预览失败」），也无需清理过期行
 *
 * 票据载荷：`<base64url(payload)>.<base64url(hmac)>`，payload = { p: pageId, s: siteId, e: 过期毫秒 }
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { formatDateTime } from '../../common/utils/datetime'
import { buildSiteUrl } from '@trillion/shared'
import { PublicService } from '../public/public.service'
import type { PageDraft } from '@trillion/shared'

interface TicketPayload {
  /** pageId */
  p: string
  /** siteId */
  s: string
  /** 过期时间（毫秒时间戳） */
  e: number
}

@Injectable()
export class PreviewService {
  private readonly logger = new Logger('Preview')

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly publicService: PublicService
  ) {}

  /** 签名密钥：内部令牌与 JWT 密钥混合派生，避免票据被用于其他用途 */
  private get secret(): string {
    return `preview:${this.config.get<string>('internalToken') || ''}:${this.config.get<string>('jwt.secret') || ''}`
  }

  /**
   * 生成预览票据
   * @returns { url, ticket, expiresAt } —— url 已带票据参数，后台直接塞给 iframe
   */
  async createTicket(user: AuthUser, dto: { siteId: string; pageId: string }) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)

    const page = await this.prisma.page.findUnique({ where: { id: dto.pageId } })
    if (!page) throw new BadRequestException('页面不存在')
    if (page.siteId !== siteId) throw new BadRequestException('页面不属于该站点')

    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { slug: true } })
    if (!site) throw new BadRequestException('站点不存在')

    const ttl = this.config.get<number>('preview.ticketTtlMs') || 30 * 60 * 1000
    const expiresAt = Date.now() + ttl
    const ticket = this.sign({ p: page.id, s: siteId, e: expiresAt })

    const base = this.config.get<string>('preview.geoBaseUrl') || ''
    const path = page.path || (page.slug === 'home' ? '/' : `/${page.slug}`)
    /**
     * 站点地址只在 shared 的 `buildSiteUrl` 里拼一次：回环基址（本地多站点共用端口）自动带
     * `/<slug>` 前缀，域名基址不带前缀——与站点列表「预览」、渲染引擎的解析口径完全一致（见 ADR-031）
     */
    const url = `${buildSiteUrl(base, site.slug, path)}?__preview=${encodeURIComponent(ticket)}`

    return {
      url,
      ticket,
      path,
      /** GEO 项目基址未配置时给出提示（iframe 会打不开，属于部署配置问题而非代码问题） */
      host: base || null,
      expiresAt: formatDateTime(new Date(expiresAt))
    }
  }

  /**
   * 解析票据（渲染引擎中间件调用）
   *
   * 渲染引擎拿到的只有 URL 上的票据串，无法自行解出 pageId（HMAC 密钥只在服务端）。
   * 因此中间件先问一次服务端「这张票是谁的」，再据此去取对应页面的草稿。
   */
  async resolveTicket(ticket: string | undefined) {
    const payload = this.verifyTicket(ticket)
    if (!payload) throw new BadRequestException('预览票据无效或已过期')
    return {
      pageId: payload.p,
      siteId: payload.s,
      expiresAt: new Date(payload.e).toISOString()
    }
  }

  /** 校验票据（渲染引擎中间件与服务端各自校验一次，成本极低） */
  verifyTicket(ticket: string | undefined): TicketPayload | null {
    if (!ticket) return null
    const [body, signature] = String(ticket).split('.')
    if (!body || !signature) return null

    const expected = createHmac('sha256', this.secret).update(body).digest('base64url')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketPayload
      if (!payload?.p || !payload?.e) return null
      if (Date.now() > payload.e) return null
      return payload
    } catch {
      return null
    }
  }

  /**
   * 预览页面数据：线上快照 + 整页草稿覆盖（草稿不存在时即线上态）
   *
   * 关键约束：**只读、不写库、不触发构建**。
   * 未发布页面也能预览（这时基线是没有的，草稿即全部内容）。
   */
  async previewPage(pageId: string, ticket?: string, internalToken?: string) {
    const payload = this.verifyTicket(ticket)
    const trusted = this.assertInternal(internalToken)

    /** 票据必须与该页面绑定；内部令牌调用时（渲染引擎已校验票据）可省票据 */
    if (!trusted) {
      if (!payload) throw new BadRequestException('预览票据无效或已过期')
      if (payload.p !== pageId) throw new BadRequestException('预览票据与页面不匹配')
    } else if (payload && payload.p !== pageId) {
      throw new BadRequestException('预览票据与页面不匹配')
    }

    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page) throw new BadRequestException('页面不存在')

    const site = await this.prisma.site.findUnique({ where: { id: page.siteId }, select: { slug: true } })
    if (!site) throw new BadRequestException('站点不存在')

    const path = page.path || (page.slug === 'home' ? '/' : `/${page.slug}`)
    const draft = (page.draft || null) as unknown as PageDraft | null

    /** 基线：允许未发布（草稿页也需能预览） */
    const base = await this.publicService.pageDetail(site.slug, path, { includeUnpublished: true })

    if (!draft) {
      return { ...base, __preview: true, hasDraft: false, draftUpdatedAt: null }
    }

    return {
      ...base,
      /** 草稿字段覆盖线上快照；草稿里的 blocks 为整页副本，直接替换 */
      title: draft.title ?? base.title,
      slug: draft.slug ?? base.slug,
      summary: draft.summary ?? base.summary,
      seoTitle: draft.seoTitle ?? base.seoTitle,
      seoDescription: draft.seoDescription ?? base.seoDescription,
      seoKeywords: draft.seoKeywords ?? base.seoKeywords,
      authorName: draft.authorName ?? base.authorName,
      kind: draft.kind ?? base.kind,
      blocks: Array.isArray(draft.blocks) ? draft.blocks : base.blocks,
      editorial: draft.editorial ?? base.editorial,
      __preview: true,
      hasDraft: true,
      draftUpdatedAt: draft.updatedAt ?? null
    }
  }

  // ---------------- 内部 ----------------

  /** 内部令牌校验（渲染引擎服务端调用时携带；未配置令牌则不信任） */
  private assertInternal(token?: string): boolean {
    const expected = this.config.get<string>('internalToken')
    if (!expected) {
      this.logger.warn('未配置内部令牌，预览接口仅接受票据鉴权')
      return false
    }
    return token === expected
  }

  private sign(payload: TicketPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const signature = createHmac('sha256', this.secret).update(body).digest('base64url')
    return `${body}.${signature}`
  }
}
