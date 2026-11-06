/**
 * 入站访问记录服务
 *
 * - 写入：GEO 中间件异步上报，一条请求一条记录；保存失败不重试（允许丢失）
 * - 查询：管理后台按站点/时间/IP/路径/资源类型/访问类别/声明爬虫/状态码分页查看
 * - 地域：保存时用 DB-IP City Lite 离线库解析，历史记录不重算
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { normalizePage, normalizePageSize } from '../../common/constants'
import { formatDateTime } from '../../common/utils/datetime'
import { CreateAccessEventDto, QueryAccessEventDto } from './dto'
import { GeoIpService } from './geo-ip.service'

/** Host → siteId 短缓存，避免高频请求反复查站点表 */
interface HostCacheEntry {
  siteId: string | null
  expires: number
}

@Injectable()
export class AccessService {
  private readonly hostCache = new Map<string, HostCacheEntry>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly geoIp: GeoIpService
  ) {}

  /** 保存一条访问记录（内部接口调用） */
  async create(dto: CreateAccessEventDto) {
    const siteId = dto.siteId || (await this.resolveSiteId(dto.host))
    const geo = await this.geoIp.lookup(dto.clientIp)
    const occurredAt = parseDateTime(dto.occurredAt) || new Date()

    const record = await this.prisma.geoAccessEvent.create({
      data: {
        siteId: siteId || null,
        host: clip(dto.host, 128),
        path: clip(dto.path, 512),
        method: clip(dto.method, 8),
        requestUrl: clip(dto.requestUrl, 768),
        clientIp: clip(dto.clientIp, 64),
        peerIp: clip(dto.peerIp, 64),
        userAgent: clip(dto.userAgent, 512),
        referer: dto.referer ? clip(dto.referer, 512) : null,
        browserName: clip(dto.browserName, 32),
        browserVersion: dto.browserVersion ? clip(dto.browserVersion, 32) : null,
        resourceType: clip(dto.resourceType, 16),
        accessCategory: clip(dto.accessCategory, 16),
        agentToken: dto.agentToken ? clip(dto.agentToken, 64) : null,
        vendor: clip(dto.vendor || 'unknown', 64),
        status: dto.status ?? null,
        durationMs: Math.max(0, Math.floor(dto.durationMs)),
        completion: dto.completion,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        geoSource: geo.source,
        geoDbVersion: geo.dbVersion,
        geoStatus: geo.status,
        occurredAt
      },
      select: { id: true }
    })
    return { id: record.id }
  }

  /** 管理后台分页明细（只做事实查看，不做统计/排名） */
  async list(query: QueryAccessEventDto) {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const from = parseDateTime(query.from)
    const to = parseDateTime(query.to)

    const where: Record<string, unknown> = {}
    if (query.siteId) where.siteId = query.siteId
    if (query.clientIp) where.clientIp = { contains: query.clientIp }
    if (query.path) where.path = { contains: query.path }
    if (query.resourceType) where.resourceType = query.resourceType
    if (query.accessCategory) where.accessCategory = query.accessCategory
    if (query.agentToken) where.agentToken = query.agentToken
    if (query.status !== undefined && query.status !== null) where.status = Number(query.status)
    if (from || to) where.occurredAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

    const [rows, total] = await Promise.all([
      this.prisma.geoAccessEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.geoAccessEvent.count({ where })
    ])

    return {
      list: rows.map((row) => ({
        id: row.id,
        siteId: row.siteId,
        host: row.host,
        path: row.path,
        method: row.method,
        requestUrl: row.requestUrl,
        clientIp: row.clientIp,
        peerIp: row.peerIp,
        userAgent: row.userAgent,
        referer: row.referer,
        browserName: row.browserName,
        browserVersion: row.browserVersion,
        resourceType: row.resourceType,
        accessCategory: row.accessCategory,
        agentToken: row.agentToken,
        vendor: row.vendor,
        status: row.status,
        durationMs: row.durationMs,
        completion: row.completion,
        country: row.country,
        region: row.region,
        city: row.city,
        geoSource: row.geoSource,
        geoDbVersion: row.geoDbVersion,
        geoStatus: row.geoStatus,
        occurredAt: formatDateTime(row.occurredAt)
      })),
      total,
      page,
      pageSize
    }
  }

  /** Host → 站点 ID：主域名或别名域名；解析不到返回 null（不强行归属） */
  private async resolveSiteId(host: string): Promise<string | null> {
    const key = String(host || '').toLowerCase()
    if (!key) return null
    const cached = this.hostCache.get(key)
    if (cached && cached.expires > Date.now()) return cached.siteId

    let siteId: string | null = null
    try {
      const site = await this.prisma.site.findFirst({
        where: { OR: [{ domain: key }, { domains: { some: { domain: key } } }] },
        select: { id: true }
      })
      siteId = site?.id || null
    } catch {
      siteId = null
    }
    this.hostCache.set(key, { siteId, expires: Date.now() + 60_000 })
    return siteId
  }
}

/** 限长裁剪（数据库列为 utf8mb4 varchar，按字符数计） */
function clip(value: string, max: number): string {
  return String(value ?? '').slice(0, max)
}

/** 解析 `YYYY-MM-DD HH:mm:ss` 或 ISO 字符串；非法返回 null */
export function parseDateTime(value?: string | null): Date | null {
  const text = String(value || '').trim()
  if (!text) return null
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/
  )
  if (!match) return null
  const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '', zone] = match
  const date = new Date(0)
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  date.setUTCHours(Number(hour), Number(minute), Number(second), Number(fraction.padEnd(3, '0')))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  )
    return null
  let offsetMinutes = 8 * 60
  if (zone === 'Z') offsetMinutes = 0
  else if (zone) {
    const offset = zone.slice(1).replace(':', '')
    const hours = Number(offset.slice(0, 2))
    const minutes = Number(offset.slice(2))
    if (hours > 23 || minutes > 59) return null
    offsetMinutes = (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes)
  }
  return new Date(date.getTime() - offsetMinutes * 60_000)
}
