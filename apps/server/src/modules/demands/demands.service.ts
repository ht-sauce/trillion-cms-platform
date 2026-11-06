/**
 * 客户需求服务：公开验证码与提交防滥用、后台跟进分页、IP 封禁维护
 */
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { isIP } from 'node:net'
import { PrismaService } from '../../prisma/prisma.service'
import { normalizePage, normalizePageSize } from '../../common/constants'
import { formatDateTime } from '../../common/utils/datetime'
import { normalizeIp } from '../../common/utils/ip'
import { CaptchaService } from './captcha.service'
import { RateLimitService } from './rate-limit.service'
import type { CreateIpBanDto, QueryDemandDto, QueryIpBanDto, SubmitDemandDto, UpdateDemandDto } from './dto'
import {
  AUTO_BAN_MS,
  CAPTCHA_WINDOW_LIMIT,
  CAPTCHA_WINDOW_MS,
  SUBMIT_WINDOW_LIMIT,
  SUBMIT_WINDOW_MS,
  TOTAL_WINDOW_LIMIT,
  TOTAL_WINDOW_MS,
  WRONG_WINDOW_LIMIT,
  WRONG_WINDOW_MS
} from './demands.constants'

interface PublicContext {
  ip: string
  siteKeys: string[]
  entryCounted?: boolean
}

@Injectable()
export class DemandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly captcha: CaptchaService,
    private readonly rateLimit: RateLimitService
  ) {}

  async createCaptcha(context: PublicContext) {
    context.ip = normalizeIp(context.ip)
    return this.rateLimit.exclusive(`ip:${context.ip}`, async () => {
      await this.assertPublicAccess(context.ip, 'captcha', !context.entryCounted)
      await this.resolveSite(context.siteKeys)
      return this.captcha.create(context.ip)
    })
  }

  async submit(dto: SubmitDemandDto, context: PublicContext) {
    const ip = normalizeIp(context.ip)
    return this.rateLimit.exclusive(`ip:${ip}`, async () => {
      await this.assertPublicAccess(ip, 'submit', !context.entryCounted)
      const site = await this.resolveSite(context.siteKeys)
      return this.rateLimit.exclusive(`captcha:${dto.captchaId}`, () =>
        this.saveSubmission(dto, { ...context, ip }, site.id)
      )
    })
  }

  private async saveSubmission(dto: SubmitDemandDto, context: PublicContext, siteId: string) {
    const submitKey = dto.submitKey.trim()
    const where = { siteId_submitKey: { siteId, submitKey } }
    const select = { id: true, createdAt: true } as const
    const existing = await this.prisma.demandSubmission.findUnique({ where, select })
    if (existing) return { id: existing.id, duplicated: true, createdAt: formatDateTime(existing.createdAt) }
    const contacts = [dto.phone, dto.wechat, dto.email, dto.otherContact].map((value) => this.clean(value))
    if (!contacts.some(Boolean)) throw new BadRequestException('请至少填写一种联系方式')
    if (dto.description.trim().length < 2) throw new BadRequestException('请填写有效需求描述')
    const sourceUrl = this.cleanSourceUrl(dto.sourceUrl, context.siteKeys)
    const verification = this.captcha.verify(dto.captchaId, dto.captchaCode, context.ip)
    if (verification !== 'ok') {
      if (verification === 'wrong') {
        const wrongCount = this.rateLimit.hit(context.ip, 'wrong', WRONG_WINDOW_MS)
        if (wrongCount >= WRONG_WINDOW_LIMIT) {
          await this.banAutomatically(context.ip, '验证码连续错误次数过多')
          throw new ForbiddenException('请求已被暂时封禁')
        }
      }
      const messages = { missing: '验证码不存在或已失效', expired: '验证码已过期', wrong: '验证码错误' }
      throw new BadRequestException(messages[verification])
    }

    try {
      const created = await this.prisma.demandSubmission.create({
        data: {
          siteId,
          clientIp: context.ip,
          description: dto.description.trim(),
          contactName: this.clean(dto.contactName),
          phone: contacts[0],
          wechat: contacts[1],
          email: contacts[2],
          otherContact: contacts[3],
          sourceUrl,
          submitKey
        },
        select: { id: true, createdAt: true }
      })
      this.captcha.consume(dto.captchaId, context.ip)
      return { id: created.id, duplicated: false, createdAt: formatDateTime(created.createdAt) }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const saved = await this.prisma.demandSubmission.findUnique({ where, select })
        if (saved) return { id: saved.id, duplicated: true, createdAt: formatDateTime(saved.createdAt) }
      }
      throw error
    }
  }

  async list(query: QueryDemandDto) {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const keyword = this.clean(query.keyword)
    const where = {
      ...(query.siteId ? { siteId: query.siteId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            OR: [
              { description: { contains: keyword } },
              { contactName: { contains: keyword } },
              { phone: { contains: keyword } },
              { wechat: { contains: keyword } },
              { email: { contains: keyword } },
              { otherContact: { contains: keyword } }
            ]
          }
        : {})
    }
    const [list, total] = await Promise.all([
      this.prisma.demandSubmission.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.demandSubmission.count({ where })
    ])
    return { list: await Promise.all(list.map((item) => this.toDemandView(item))), total, page, pageSize }
  }

  async detail(id: string) {
    const item = await this.prisma.demandSubmission.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('需求记录不存在')
    return this.toDemandView(item)
  }

  async widgetConfig(context: PublicContext) {
    const site = await this.resolveSite(context.siteKeys)
    return {
      version: 1,
      widgetKey: site.slug,
      siteName: site.name,
      captchaPath: '/geoserver/demands/captcha',
      submitPath: '/geoserver/demands/submit'
    }
  }

  async update(id: string, dto: UpdateDemandDto) {
    const exists = await this.prisma.demandSubmission.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('需求记录不存在')
    if (dto.status === undefined && dto.note === undefined) throw new BadRequestException('未提供需要更新的字段')
    const item = await this.prisma.demandSubmission.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: this.clean(dto.note) } : {})
      }
    })
    return this.toDemandView(item)
  }

  async listBans(query: QueryIpBanDto) {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const where = {
      ...(query.ip ? { ip: { contains: query.ip.trim() } } : {}),
      ...(query.source ? { source: query.source } : {})
    }
    const [list, total] = await Promise.all([
      this.prisma.geoIpBan.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.geoIpBan.count({ where })
    ])
    return { list: list.map((item) => this.toBanView(item)), total, page, pageSize }
  }

  async createBan(dto: CreateIpBanDto) {
    const ip = normalizeIp(dto.ip)
    if (!ip || !isIP(ip)) throw new BadRequestException('IP 地址格式不正确')
    return this.rateLimit.exclusive(`ip:${ip}`, async () => {
      const item = await this.prisma.geoIpBan.upsert({
        where: { ip },
        update: { reason: dto.reason.trim(), source: 'manual', expiresAt: null },
        create: { ip, reason: dto.reason.trim(), source: 'manual', expiresAt: null }
      })
      this.rateLimit.reset(ip)
      return this.toBanView(item)
    })
  }

  async removeBan(rawIp: string) {
    const ip = normalizeIp(rawIp)
    if (!isIP(ip)) throw new BadRequestException('IP 地址格式不正确')
    return this.rateLimit.exclusive(`ip:${ip}`, async () => {
      const item = await this.prisma.geoIpBan.findUnique({ where: { ip }, select: { id: true, ip: true } })
      if (!item) throw new NotFoundException('封禁记录不存在')
      await this.prisma.geoIpBan.delete({ where: { ip } })
      this.rateLimit.reset(item.ip)
      return { ip }
    })
  }

  async countPublicEntry(rawIp: string, endpoint: 'captcha' | 'submit') {
    const ip = normalizeIp(rawIp)
    return this.rateLimit.exclusive(`ip:${ip}`, () => this.assertPublicAccess(ip, endpoint))
  }

  private async assertPublicAccess(ip: string, endpoint: 'captcha' | 'submit', count = true) {
    if (!isIP(ip)) throw new BadRequestException('无法识别客户端地址')
    const ban = await this.prisma.geoIpBan.findUnique({ where: { ip } })
    if (ban) {
      if (ban.source === 'auto' && ban.expiresAt && ban.expiresAt.getTime() <= Date.now()) {
        await this.prisma.geoIpBan.deleteMany({ where: { id: ban.id, source: 'auto', expiresAt: { lte: new Date() } } })
        this.rateLimit.reset(ip)
        const current = await this.prisma.geoIpBan.findUnique({ where: { ip } })
        if (current) throw new ForbiddenException('请求已被封禁')
      } else {
        throw new ForbiddenException('请求已被封禁')
      }
    }

    if (!count) return
    const total = this.rateLimit.hit(ip, 'total', TOTAL_WINDOW_MS)
    if (total > TOTAL_WINDOW_LIMIT) {
      await this.banAutomatically(ip, '需求公开接口请求频率过高')
      throw new ForbiddenException('请求已被暂时封禁')
    }
    const windowMs = endpoint === 'captcha' ? CAPTCHA_WINDOW_MS : SUBMIT_WINDOW_MS
    const limit = endpoint === 'captcha' ? CAPTCHA_WINDOW_LIMIT : SUBMIT_WINDOW_LIMIT
    if (this.rateLimit.hit(ip, endpoint, windowMs) > limit) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  private async banAutomatically(ip: string, reason: string) {
    try {
      await this.prisma.geoIpBan.create({
        data: { ip, reason, source: 'auto', expiresAt: new Date(Date.now() + AUTO_BAN_MS) }
      })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
    }
  }

  private async resolveSite(keys: string[]) {
    const key = keys[0]
    if (key) {
      const site = await this.prisma.site.findFirst({
        where: { status: 'active', OR: [{ domain: key }, { domains: { some: { domain: key } } }] },
        select: { id: true, name: true, slug: true }
      })
      if (site) return site
    }
    throw new BadRequestException('无法识别提交来源站点')
  }

  private clean(value?: string): string | null {
    const text = String(value || '').trim()
    return text || null
  }

  private cleanSourceUrl(value: string | undefined, siteKeys: string[]): string | null {
    if (!value) return null
    try {
      const url = new URL(value)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hostname.toLowerCase() !== siteKeys[0]
      )
        throw new Error('invalid source')
      return `${url.origin}${url.pathname}`.slice(0, 512)
    } catch {
      throw new BadRequestException('来源页面地址不匹配')
    }
  }

  private async toDemandView(item: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
    const view = { ...item }
    delete view.submitKey
    const [site, ban] = await Promise.all([
      this.prisma.site.findUnique({ where: { id: String(item.siteId) }, select: { name: true } }),
      this.prisma.geoIpBan.findUnique({ where: { ip: String(item.clientIp) } })
    ])
    const activeBan =
      ban && (ban.source === 'manual' || !ban.expiresAt || ban.expiresAt.getTime() > Date.now())
        ? this.toBanView(ban)
        : null
    return {
      ...view,
      siteName: site?.name,
      ban: activeBan,
      createdAt: formatDateTime(item.createdAt),
      updatedAt: formatDateTime(item.updatedAt)
    }
  }

  private toBanView(item: { createdAt: Date; updatedAt: Date; expiresAt: Date | null; [key: string]: unknown }) {
    return {
      ...item,
      expiresAt: formatDateTime(item.expiresAt),
      createdAt: formatDateTime(item.createdAt),
      updatedAt: formatDateTime(item.updatedAt)
    }
  }
}
