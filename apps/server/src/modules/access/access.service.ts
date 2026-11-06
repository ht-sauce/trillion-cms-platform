/**
 * 入站访问记录服务
 *
 * - 写入：GEO 中间件异步上报，一条请求一条记录；保存失败不重试（允许丢失）
 * - 查询：管理后台按站点/时间/IP/路径/资源类型/访问类别/声明爬虫/状态码分页查看
 * - 地域：保存时用 DB-IP City Lite 离线库解析，历史记录不重算
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { normalizePage, normalizePageSize } from '../../common/constants'
import { formatDateTime } from '../../common/utils/datetime'
import { ACCESS_CATEGORIES, CreateAccessEventDto, QueryAccessEventDto, QueryAccessSummaryDto } from './dto'
import { GeoIpService } from './geo-ip.service'

/** Host → siteId 短缓存，避免高频请求反复查站点表 */
interface HostCacheEntry {
  siteId: string | null
  expires: number
}

type AggregateRow = Record<string, string | number | bigint | Prisma.Decimal | Date | null>

const DAY_MS = 86_400_000
const CHINA_MS = 8 * 3_600_000
const STATUS_KEYS = ['success', 'notModified', 'redirect', 'clientError', 'serverError', 'unknown', 'aborted'] as const
const abnormalSql = Prisma.sql`(status BETWEEN 400 AND 599 OR completion = 'aborted')`
const statusSql = Prisma.sql`
  SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success,
  SUM(CASE WHEN status = 304 THEN 1 ELSE 0 END) AS notModified,
  SUM(CASE WHEN status BETWEEN 300 AND 399 AND status <> 304 THEN 1 ELSE 0 END) AS redirect,
  SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS clientError,
  SUM(CASE WHEN status BETWEEN 500 AND 599 THEN 1 ELSE 0 END) AS serverError,
  SUM(CASE WHEN status IS NULL OR status < 200 OR status >= 600 THEN 1 ELSE 0 END) AS unknown,
  SUM(CASE WHEN completion = 'aborted' THEN 1 ELSE 0 END) AS aborted`
const categorySql = Prisma.sql`CASE WHEN access_category IN ('browser', 'search_bot', 'ai_bot') THEN access_category ELSE 'unknown' END`

function numeric(row: AggregateRow | undefined, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, Number(row?.[key] ?? 0)]))
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

  async summary(query: QueryAccessSummaryDto) {
    const today = Math.floor((Date.now() + CHINA_MS) / DAY_MS) * DAY_MS - CHINA_MS
    const hasFrom = query.from !== undefined
    const hasTo = query.to !== undefined
    if (hasFrom !== hasTo) throw new BadRequestException('from 和 to 必须同时提供')
    let from = new Date(today - 6 * DAY_MS)
    let to = new Date(today + DAY_MS - 1_000)
    if (hasFrom) {
      if (typeof query.from !== 'string' || typeof query.to !== 'string') throw new BadRequestException('日期格式无效')
      from = parseDateTime(query.from)
      to = parseDateTime(query.to)
      if (!from || !to) throw new BadRequestException('日期格式无效')
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to.trim())) to = new Date(to.getTime() + DAY_MS - 1_000)
      if (from.getUTCFullYear() < 1000 || to.getUTCFullYear() > 9999) throw new BadRequestException('日期超出支持范围')
    }
    const span = to.getTime() - from.getTime()
    if (span < 0 || span >= 90 * DAY_MS) throw new BadRequestException('时间范围倒置或超过 90 天')
    const granularity = span < 2 * DAY_MS ? 'hour' : 'day'
    const step = granularity === 'hour' ? 3_600_000 : DAY_MS
    const conditions = [
      Prisma.sql`occurred_at >= ${from.toISOString().slice(0, 23).replace('T', ' ')}`,
      Prisma.sql`occurred_at <= ${to.toISOString().slice(0, 23).replace('T', ' ')}`
    ]
    if (query.siteId) conditions.push(Prisma.sql`site_id = ${query.siteId}`)
    if (query.clientIp) conditions.push(Prisma.sql`LOCATE(${query.clientIp}, client_ip) > 0`)
    if (query.path) conditions.push(Prisma.sql`LOCATE(${query.path}, path) > 0`)
    if (query.resourceType) conditions.push(Prisma.sql`resource_type = ${query.resourceType}`)
    if (query.accessCategory) conditions.push(Prisma.sql`access_category = ${query.accessCategory}`)
    if (query.agentToken) conditions.push(Prisma.sql`agent_token = ${query.agentToken}`)
    if (query.status !== undefined && query.status !== null) conditions.push(Prisma.sql`status = ${query.status}`)
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    const bucketFormat = granularity === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d 00:00:00'
    const sourceRows = Prisma.sql`
      SELECT *, CASE
        WHEN referer IS NULL OR TRIM(referer) = '' THEN 'missing'
        WHEN referer NOT REGEXP '^https?://[^/?#[:space:]]+' OR domain = '' THEN 'invalid'
        WHEN domain = LOWER(CASE WHEN LEFT(host, 1) = '[' THEN SUBSTRING_INDEX(host, ']', 1)
          ELSE SUBSTRING_INDEX(host, ':', 1) END) THEN 'internal'
        ELSE 'external' END AS kind
      FROM (
        SELECT host, referer, LOWER(CASE WHEN LEFT(authority, 1) = '[' THEN SUBSTRING_INDEX(authority, ']', 1)
          ELSE SUBSTRING_INDEX(authority, ':', 1) END) AS domain
        FROM (
          SELECT host, referer, SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(
            SUBSTRING_INDEX(referer, '://', -1), '/', 1), '?', 1), '#', 1), '@', -1) AS authority
          FROM GeoAccessEvent ${where}
        ) authorities
      ) domains`
    const data = await this.prisma.$transaction(
      async (tx) => {
        const totals = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT COUNT(*) AS requests,
          SUM(CASE WHEN resource_type = 'page' THEN 1 ELSE 0 END) AS pageRequests,
          SUM(CASE WHEN access_category = 'ai_bot' THEN 1 ELSE 0 END) AS aiBotRequests,
          SUM(CASE WHEN ${abnormalSql} THEN 1 ELSE 0 END) AS abnormalRequests,
          ${statusSql} FROM GeoAccessEvent ${where}`)
        const categories = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT ${categorySql} AS category, COUNT(*) AS requests FROM GeoAccessEvent ${where}
        GROUP BY category ORDER BY category`)
        const trend = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT DATE_FORMAT(DATE_ADD(occurred_at, INTERVAL 8 HOUR), ${bucketFormat}) AS bucket,
          ${categorySql} AS category, COUNT(*) AS requests FROM GeoAccessEvent ${where}
        GROUP BY bucket, category ORDER BY bucket, category`)
        const crawlers = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT access_category AS category, agent_token AS agentToken, vendor, COUNT(*) AS requests,
          SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN status = 304 THEN 1 ELSE 0 END) AS notModified,
          SUM(CASE WHEN ${abnormalSql} THEN 1 ELSE 0 END) AS abnormalRequests,
          MAX(occurred_at) AS lastRequestedAt FROM GeoAccessEvent ${where}
        AND access_category IN ('search_bot', 'ai_bot')
        GROUP BY access_category, agent_token, vendor
        ORDER BY requests DESC, category, agentToken, vendor LIMIT 10`)
        const pages = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT host, path, COUNT(*) AS requests,
          SUM(CASE WHEN access_category = 'ai_bot' THEN 1 ELSE 0 END) AS aiBotRequests,
          SUM(CASE WHEN ${abnormalSql} THEN 1 ELSE 0 END) AS abnormalRequests
        FROM GeoAccessEvent ${where} AND resource_type = 'page'
        GROUP BY host, path ORDER BY requests DESC, host, path LIMIT 10`)
        const resources = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT resource_type AS resourceType, COUNT(*) AS requests, ${statusSql}
        FROM GeoAccessEvent ${where} AND resource_type IN ('llms', 'sitemap', 'robots')
        GROUP BY resource_type ORDER BY resource_type`)
        const referrerSummary = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT kind, COUNT(*) AS requests FROM (${sourceRows}) sources GROUP BY kind ORDER BY kind`)
        const referrers = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT domain, COUNT(*) AS requests FROM (${sourceRows}) sources WHERE kind = 'external'
        GROUP BY domain ORDER BY requests DESC, domain LIMIT 10`)
        const locations = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT country, region, city, geo_status AS geoStatus, geo_source AS geoSource, COUNT(*) AS requests
        FROM GeoAccessEvent ${where} GROUP BY country, region, city, geo_status, geo_source
        ORDER BY requests DESC, geoStatus, country, region, city, geoSource LIMIT 10`)
        return { totals, categories, trend, crawlers, pages, resources, referrerSummary, referrers, locations }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 }
    )
    const totals = numeric(data.totals[0], ['requests', 'pageRequests', 'aiBotRequests', 'abnormalRequests'])
    const trend = []
    for (
      let time = Math.floor((from.getTime() + CHINA_MS) / step) * step - CHINA_MS;
      time <= to.getTime();
      time += step
    ) {
      trend.push({ bucket: formatDateTime(new Date(time)), browser: 0, search_bot: 0, ai_bot: 0, unknown: 0 })
    }
    const buckets = new Map(trend.map((row) => [row.bucket, row]))
    for (const row of data.trend) {
      const bucket = buckets.get(String(row.bucket))
      if (bucket && ACCESS_CATEGORIES.includes(row.category as (typeof ACCESS_CATEGORIES)[number]))
        bucket[String(row.category)] = Number(row.requests)
    }
    return {
      range: { from: formatDateTime(from), to: formatDateTime(to), timezone: 'Asia/Shanghai' },
      granularity,
      totals,
      categories: ACCESS_CATEGORIES.map((category) => {
        const requests = Number(data.categories.find((row) => row.category === category)?.requests ?? 0)
        return { category, requests, ratio: totals.requests ? requests / totals.requests : null }
      }),
      trend,
      statuses: numeric(data.totals[0], STATUS_KEYS),
      crawlers: data.crawlers.map((row) => ({
        category: row.category,
        agentToken: row.agentToken,
        vendor: row.vendor,
        ...numeric(row, ['requests', 'success', 'notModified', 'abnormalRequests']),
        lastRequestedAt: formatDateTime(row.lastRequestedAt)
      })),
      pages: data.pages.map((row) => ({
        host: row.host,
        path: row.path,
        ...numeric(row, ['requests', 'aiBotRequests', 'abnormalRequests'])
      })),
      resources: ['llms', 'sitemap', 'robots'].map((resourceType) => {
        const row = data.resources.find((item) => item.resourceType === resourceType)
        return { resourceType, requests: Number(row?.requests ?? 0), statuses: numeric(row, STATUS_KEYS) }
      }),
      referrers: data.referrers.map((row) => ({ domain: row.domain, requests: Number(row.requests) })),
      referrerSummary: Object.fromEntries(
        ['external', 'internal', 'missing', 'invalid'].map((kind) => [
          kind,
          Number(data.referrerSummary.find((row) => row.kind === kind)?.requests ?? 0)
        ])
      ),
      locations: data.locations.map((row) => ({
        country: row.country,
        region: row.region,
        city: row.city,
        geoStatus: row.geoStatus,
        geoSource: row.geoSource,
        requests: Number(row.requests)
      })),
      locationAttribution: { name: 'DB-IP City Lite', url: 'https://db-ip.com' }
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
