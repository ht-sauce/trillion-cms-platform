/**
 * 埋点接口
 * collect 为公开接口（静态站无登录态），仅做基础限流；统计接口需 admin 鉴权
 */
import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { TrackService } from './track.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { matchAiCrawler } from '../../config/ai-crawlers'

@ApiTags('埋点与 AI 爬虫监控')
@Controller('track')
export class TrackController {
  /** 简单 IP 限流：同 IP 每秒最多 20 条 */
  private hits = new Map<string, { count: number; ts: number }>()

  constructor(private readonly service: TrackService) {}

  @Post('collect')
  @HttpCode(200)
  @ApiOperation({ summary: '路由访问埋点上报（sendBeacon）' })
  collect(@Req() request: Request, @Body() body: { siteId: string; path: string; referrer?: string; anonId?: string }) {
    const ip = (request.headers['x-forwarded-for'] as string) || request.ip || 'unknown'
    if (!this.allow(ip)) return { skipped: true }

    const userAgent = String(request.headers['user-agent'] || '')
    this.service.collect({
      siteId: body.siteId,
      path: String(body.path || '/').slice(0, 255),
      referrer: String(body.referrer || '').slice(0, 255),
      anonId: String(body.anonId || ip).slice(0, 64),
      userAgent: userAgent.slice(0, 512)
    })

    /** 顺带识别：若访客本就是 AI 爬虫，直接记入 AI 抓取事件 */
    const bot = matchAiCrawler(userAgent)
    if (bot) {
      void this.service.recordAiCrawl({
        siteId: body.siteId,
        botType: bot,
        path: String(body.path || '/')
      })
    }

    return { ok: true }
  }

  @Get('overview')
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'PV/UV 概览与 Top 页面' })
  overview(@Query('siteId') siteId: string, @Query('days') days?: string) {
    return this.service.overview(siteId, Number(days || 7))
  }

  @Get('ai-overview')
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'AI 爬虫抓取概览（爬虫类型与路径 Top）' })
  aiOverview(@Query('siteId') siteId: string, @Query('days') days?: string) {
    return this.service.aiOverview(siteId, Number(days || 7))
  }

  @Post('ai-crawl')
  @ApiOperation({ summary: 'AI 抓取事件批量入库（nginx 日志采集器调用）' })
  aiCrawl(
    @Body() body: { events: { siteId: string; botType: string; path: string; status?: number; bytes?: number }[] }
  ) {
    return this.service.recordAiCrawlMany(body.events || [])
  }

  private allow(ip: string): boolean {
    const now = Date.now()
    const record = this.hits.get(ip)
    if (!record || now - record.ts > 1000) {
      this.hits.set(ip, { count: 1, ts: now })
      return true
    }
    if (record.count >= 20) return false
    record.count += 1
    return true
  }
}
