/**
 * 埋点服务
 * 内存队列攒批写入：高频上报场景下避免单条 insert 打爆 MySQL
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

interface PendingTrack {
  siteId: string
  path: string
  referrer: string
  anonId: string
  userAgent: string
}

@Injectable()
export class TrackService implements OnModuleDestroy {
  private readonly logger = new Logger('Track')
  private queue: PendingTrack[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly prisma: PrismaService) {
    /** 每 2 秒自动 flush 一次 */
    this.timer = setInterval(() => void this.flush(), 2000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    void this.flush()
  }

  /** 接收埋点（入队，立即返回，不阻塞前端） */
  collect(payload: PendingTrack) {
    if (this.queue.length >= 5000) {
      this.logger.warn('埋点队列已满，丢弃本次上报')
      return
    }
    this.queue.push(payload)
  }

  /** 攒批写入数据库 */
  async flush() {
    if (!this.queue.length) return
    const batch = this.queue.splice(0, this.queue.length)
    try {
      await this.prisma.trackEvent.createMany({ data: batch })
    } catch (error) {
      this.logger.error(`埋点写入失败：${(error as Error).message}`)
    }
  }

  /** AI 爬虫事件入表（单条，来源为 nginx 日志采集或 llms.txt 命中） */
  async recordAiCrawl(data: { siteId: string; botType: string; path: string; status?: number; bytes?: number }) {
    return this.prisma.aiCrawlEvent.create({
      data: {
        siteId: data.siteId,
        botType: data.botType,
        path: data.path,
        status: data.status ?? 200,
        bytes: data.bytes ?? 0
      }
    })
  }

  /** AI 爬虫事件批量入表（日志回放场景） */
  async recordAiCrawlMany(list: { siteId: string; botType: string; path: string; status?: number; bytes?: number }[]) {
    if (!list.length) return { count: 0 }
    const result = await this.prisma.aiCrawlEvent.createMany({
      data: list.map((item) => ({
        siteId: item.siteId,
        botType: item.botType,
        path: item.path,
        status: item.status ?? 200,
        bytes: item.bytes ?? 0
      }))
    })
    return { count: result.count }
  }

  /** 站点 PV/UV 概览（按路由分组 Top） */
  async overview(siteId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const rows = await this.prisma.trackEvent.groupBy({
      by: ['path'],
      where: { siteId, createdAt: { gte: since } },
      _count: { _all: true }
    })
    const total = rows.reduce((sum, row) => sum + row._count._all, 0)

    const uvRows = await this.prisma.trackEvent.findMany({
      where: { siteId, createdAt: { gte: since } },
      select: { anonId: true },
      distinct: ['anonId']
    })

    const top = [...rows]
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 20)
      .map((row) => ({
        path: row.path,
        pv: row._count._all
      }))

    return { siteId, days, pv: total, uv: uvRows.length, topPages: top }
  }

  /** AI 爬虫抓取概览（按爬虫类型与路径 Top） */
  async aiOverview(siteId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const byBot = await this.prisma.aiCrawlEvent.groupBy({
      by: ['botType'],
      where: { siteId, createdAt: { gte: since } },
      _count: { _all: true }
    })
    const byPath = await this.prisma.aiCrawlEvent.groupBy({
      by: ['path'],
      where: { siteId, createdAt: { gte: since } },
      _count: { _all: true },
      // Prisma 规定 groupBy 使用 take 时必须同时给出 orderBy，按该路径抓取次数倒序
      orderBy: { _count: { path: 'desc' } },
      take: 20
    })

    const bots = byBot
      .map((row) => ({ botType: row.botType, count: row._count._all }))
      .sort((a, b) => b.count - a.count)
    const paths = byPath.map((row) => ({ path: row.path, count: row._count._all })).sort((a, b) => b.count - a.count)

    return {
      siteId,
      days,
      total: bots.reduce((sum, row) => sum + row.count, 0),
      bots,
      paths
    }
  }
}
