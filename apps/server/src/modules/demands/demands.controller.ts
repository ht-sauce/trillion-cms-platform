/**
 * 客户需求接口：公开验证码与提交、后台分页跟进及 IP 封禁管理
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { isTrustedProxy, normalizeIp, resolveClientIp } from '../../common/utils/ip'
import type { AppConfig } from '../../config/configuration'
import { CreateIpBanDto, QueryDemandDto, QueryIpBanDto, SubmitDemandDto, UpdateDemandDto } from './dto'
import { DemandsService } from './demands.service'

@ApiTags('客户需求')
@Controller('demands')
export class DemandsController {
  constructor(
    private readonly service: DemandsService,
    private readonly config: ConfigService<AppConfig>
  ) {}

  @Get('captcha')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: '获取一次性图片验证码' })
  captcha(@Req() request: Request) {
    return this.service.createCaptcha(this.publicContext(request))
  }

  @Post('submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: '公开提交客户需求' })
  submit(@Req() request: Request, @Body() dto: SubmitDemandDto) {
    return this.service.submit(dto, this.publicContext(request))
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  @ApiOperation({ summary: '客户需求分页列表' })
  list(@Query() query: QueryDemandDto) {
    return this.service.list(query)
  }

  @Get('widget-config')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  widgetConfig(@Req() request: Request) {
    return this.service.widgetConfig(this.publicContext(request))
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id)
  }

  @Patch(':id/follow-up')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  @ApiOperation({ summary: '更新跟进状态与内部备注' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDemandDto) {
    return this.service.update(id, dto)
  }

  @Get('bans/list')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  @ApiOperation({ summary: 'IP 封禁分页列表' })
  listBans(@Query() query: QueryIpBanDto) {
    return this.service.listBans(query)
  }

  @Post('ip-bans')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  @ApiOperation({ summary: '人工封禁 IP' })
  createBan(@Body() dto: CreateIpBanDto) {
    return this.service.createBan(dto)
  }

  @Delete('ip-bans/:ip')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/sites/demands')
  @ApiOperation({ summary: '解除 IP 封禁' })
  removeBan(@Param('ip') ip: string) {
    return this.service.removeBan(ip)
  }

  publicContext(request: Request) {
    const peerIp = request.socket.remoteAddress || ''
    const forwarded = this.header(request, 'x-forwarded-for')
    const ip = resolveClientIp(peerIp, forwarded, this.config.get<string[]>('trustedProxies') || [])
    const siteKeys = this.siteKeys(request)
    const localHosts = ['localhost', '127.0.0.1', '[::1]']
    const developmentSite =
      this.config.get('env') === 'development' &&
      ['127.0.0.1', '::1'].includes(normalizeIp(peerIp)) &&
      (this.header(request, 'origin') || this.header(request, 'referer')) &&
      siteKeys.length === 1 &&
      localHosts.includes(siteKeys[0])
        ? this.header(request, 'x-development-site')?.trim()
        : undefined
    return { ip, siteKeys, developmentSite, entryCounted: countedRequests.has(request) }
  }

  private siteKeys(request: Request): string[] {
    const keys = new Set<string>()
    const origins = new Set<string>()
    for (const value of [this.header(request, 'origin'), this.header(request, 'referer')]) {
      if (value === undefined) continue
      try {
        const url = new URL(value)
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          (value === this.header(request, 'origin') && value !== url.origin)
        )
          throw new Error('invalid source')
        origins.add(url.origin)
        keys.add(url.hostname.toLowerCase())
      } catch {
        throw new BadRequestException('来源地址格式不正确')
      }
    }
    if (origins.size > 1) throw new BadRequestException('来源地址不一致')
    if (keys.size) return [...keys]
    const trusted = isTrustedProxy(
      request.socket.remoteAddress || '',
      this.config.get<string[]>('trustedProxies') || []
    )
    const forwardedHost = trusted ? this.header(request, 'x-forwarded-host')?.split(',').pop()?.trim() : undefined
    const host = forwardedHost || this.header(request, 'host')
    if (host) {
      try {
        const url = new URL(`http://${host}`)
        if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
          throw new Error('invalid host')
        keys.add(url.hostname.toLowerCase())
      } catch {
        throw new BadRequestException('来源域名格式不正确')
      }
    }
    return [...keys].filter(Boolean)
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
}

export const countedRequests = new WeakSet<Request>()
