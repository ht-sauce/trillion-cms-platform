/**
 * IP 工具：归一化与可信代理判定
 *
 * 规则（见需求方案 §3.3）：
 * - 直接访问使用 socket 的 remoteAddress；
 * - 只有 peerIp 命中配置的可信代理 CIDR 才解析 X-Forwarded-For，并按代理链**从右向左**定位客户端；
 * - 不直接相信最左 X-Forwarded-For，也不无条件信任所有代理。
 */
import { isIP } from 'node:net'

/** 归一化 IP：去端口/方括号/zone，IPv4-mapped IPv6 还原为 IPv4，IPv6 统一小写 */
export function normalizeIp(value: string | undefined | null): string {
  let ip = String(value || '').trim()
  if (!ip) return ''
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']')
    if (end > 0) ip = ip.slice(1, end)
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'))
  }
  const zone = ip.indexOf('%')
  if (zone >= 0) ip = ip.slice(0, zone)
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const tail = ip.slice(7)
    if (isIP(tail) === 4) return tail
  }
  if (isIP(ip) === 6) {
    const value = ipv6ToBigInt(ip)
    if (value !== null && value >> 32n === 0xffffn) {
      return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.')
    }
  }
  return isIP(ip) === 6 ? ip.toLowerCase() : ip
}

/** IPv4 → BigInt */
function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const part of parts) {
    const num = Number(part)
    if (!Number.isInteger(num) || num < 0 || num > 255) return null
    value = (value << 8n) + BigInt(num)
  }
  return value
}

/** IPv6 → BigInt（支持 `::` 压缩与 IPv4 结尾） */
function ipv6ToBigInt(ip: string): bigint | null {
  let text = ip.toLowerCase()
  const v4Tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (v4Tail) {
    const v4 = ipv4ToBigInt(v4Tail[1])
    if (v4 === null) return null
    text = text.replace(v4Tail[1], `${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`)
  }
  const [head, tail] = text.split('::')
  const headParts = head ? head.split(':').filter(Boolean) : []
  const tailParts = tail ? tail.split(':').filter(Boolean) : []
  const missing = 8 - headParts.length - tailParts.length
  if (text.includes('::') ? missing < 0 : missing !== 0) return null
  const groups = [...headParts, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...tailParts]
  let value = 0n
  for (const group of groups) {
    const num = Number.parseInt(group, 16)
    if (!Number.isInteger(num) || num < 0 || num > 0xffff) return null
    value = (value << 16n) + BigInt(num)
  }
  return value
}

/** 判断 IP 是否落在单个 CIDR 内 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIp(ip)
  const [rawBase, rawBits] = String(cidr || '').split('/')
  const base = normalizeIp(rawBase)
  if (!normalizedIp || !base) return false
  const family = isIP(normalizedIp)
  if (family !== isIP(base)) return false

  const maxBits = family === 4 ? 32 : 128
  const bits = rawBits === undefined ? maxBits : Number(rawBits)
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return false

  const ipValue = family === 4 ? ipv4ToBigInt(normalizedIp) : ipv6ToBigInt(normalizedIp)
  const baseValue = family === 4 ? ipv4ToBigInt(base) : ipv6ToBigInt(base)
  if (ipValue === null || baseValue === null) return false

  const shift = BigInt(maxBits - bits)
  return ipValue >> shift === baseValue >> shift
}

/** 判断 IP 是否命中任一可信代理 CIDR */
export function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
  if (!trustedProxies.length) return false
  return trustedProxies.some((cidr) => ipInCidr(ip, cidr))
}

/**
 * 解析客户端 IP
 * @param peerIp 直连对端 IP（socket remoteAddress）
 * @param forwardedFor X-Forwarded-For 原始值（可能为空）
 * @param trustedProxies 可信代理 CIDR 列表
 */
export function resolveClientIp(peerIp: string, forwardedFor: string | undefined, trustedProxies: string[]): string {
  const peer = normalizeIp(peerIp)
  if (!peer) return ''
  if (!forwardedFor || !isTrustedProxy(peer, trustedProxies)) return peer

  const chain = forwardedFor
    .split(',')
    .map((item) => normalizeIp(item))
    .filter(Boolean)
  /** 从右向左：跳过可信代理，第一个不可信地址即客户端 */
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (!isTrustedProxy(chain[i], trustedProxies)) return chain[i]
  }
  return chain[0] || peer
}
