/**
 * IP 地域解析服务（DB-IP City Lite 离线 MMDB）
 *
 * 只在保存访问日志时解析，保留当时结果；查询不重算历史地域。
 * 内网 / 回环 / 保留地址、未命中与库不可用一律返回空地域，不猜城市，也不影响原日志保存。
 * 数据许可 CC BY 4.0：展示结果的页面保留「IP Geolocation by DB-IP」署名。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isIP } from 'node:net'
import { open, type CityResponse, type Reader } from 'maxmind'
import { ipInCidr, normalizeIp } from '../../common/utils/ip'

export interface GeoLookupResult {
  country: string | null
  region: string | null
  city: string | null
  source: string | null
  dbVersion: string | null
  status: 'resolved' | 'non_public' | 'invalid_ip' | 'not_found' | 'unavailable' | 'error'
}

const EMPTY_GEO: GeoLookupResult = {
  country: null,
  region: null,
  city: null,
  source: 'DB-IP City Lite',
  dbVersion: null,
  status: 'unavailable'
}

/** 非公网地址段：直接返回未知，不查库 */
const NON_PUBLIC_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '::/128',
  '::1/128',
  '2001:db8::/32',
  '2001:2::/48',
  'fc00::/7',
  'fe80::/10',
  'fec0::/10',
  'ff00::/8'
]

@Injectable()
export class GeoIpService {
  private readonly logger = new Logger('GeoIp')
  private reader: Reader<CityResponse> | null = null
  private readerPromise: Promise<Reader<CityResponse> | null> | null = null
  private readerPath = ''

  constructor(private readonly config: ConfigService) {}

  /** 解析 IP 的近似地域；任何异常都返回空地域 */
  async lookup(ip: string): Promise<GeoLookupResult> {
    const value = normalizeIp(ip)
    if (!value || isIP(value) === 0) return { ...EMPTY_GEO, status: 'invalid_ip' }
    if (isNonPublic(value)) return { ...EMPTY_GEO, status: 'non_public' }

    const reader = await this.getReader()
    if (!reader) return { ...EMPTY_GEO }
    const dbVersion = versionOf(reader)

    try {
      const record = reader.get(value)
      if (!record) return { ...EMPTY_GEO, dbVersion, status: 'not_found' }
      const country = pickName(record.country?.names) || pickName(record.registered_country?.names)
      const region = pickName(record.subdivisions?.[0]?.names)
      const city = pickName(record.city?.names)
      return {
        country,
        region,
        city,
        source: 'DB-IP City Lite',
        dbVersion,
        status: 'resolved'
      }
    } catch (error) {
      this.logger.warn(`IP 地域解析失败（已忽略）：${(error as Error).message}`)
      return { ...EMPTY_GEO, dbVersion, status: 'error' }
    }
  }

  /** 懒加载 MMDB；文件缺失或读取失败只记录一次告警 */
  private async getReader(): Promise<Reader<CityResponse> | null> {
    if (this.reader) return this.reader
    if (this.readerPromise) return this.readerPromise

    this.readerPromise = (async () => {
      const configured = String(this.config.get<string>('dbipCityMmdb') || '').trim()
      if (!configured) return null
      const filePath = resolve(process.cwd(), configured)
      this.readerPath = filePath
      if (!existsSync(filePath)) {
        this.logger.warn(`未找到 IP 地域库：${filePath}（地域字段将留空，访问日志仍正常保存）`)
        return null
      }
      try {
        this.reader = await open<CityResponse>(filePath, { cache: { max: 1000 } })
        this.logger.log(`IP 地域库已加载：${filePath}`)
        return this.reader
      } catch (error) {
        this.logger.warn(`IP 地域库加载失败（地域字段将留空）：${(error as Error).message}`)
        return null
      }
    })()

    return this.readerPromise
  }
}

/** 判断是否属于内网 / 回环 / 保留地址 */
function isNonPublic(ip: string): boolean {
  return NON_PUBLIC_CIDRS.some((cidr) => ipInCidr(ip, cidr))
}

/** 名称优先中文，其次英文 */
function pickName(names?: { 'zh-CN'?: string; zh?: string; en?: string }): string | null {
  if (!names) return null
  return names['zh-CN'] || names.zh || names.en || null
}

/** 库版本：MMDB buildEpoch 转日期 */
function versionOf(reader: Reader<CityResponse>): string | null {
  try {
    const epoch = reader.metadata?.buildEpoch
    if (!epoch) return null
    const date = epoch instanceof Date ? epoch : new Date(Number(epoch) * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  } catch {
    return null
  }
}
