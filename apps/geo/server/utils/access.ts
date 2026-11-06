import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'

type AccessCategory = 'browser' | 'search_bot' | 'ai_bot' | 'unknown'
type ResourceType = 'page' | 'asset' | 'llms' | 'sitemap' | 'robots' | 'payload' | 'other'

interface AgentInfo {
  accessCategory: AccessCategory
  browserName: string
  browserVersion?: string
  agentToken?: string
  vendor: string
}

export interface AccessInfo extends AgentInfo {
  host: string
  path: string
  method: string
  requestUrl: string
  clientIp: string
  peerIp: string
  userAgent: string
  referer: string
  resourceType: ResourceType
  occurredAt: string
  status?: number
  durationMs: number
  completion: 'finished' | 'aborted'
}

function ipValue(ip: string): bigint {
  if (isIP(ip) === 4) return ip.split('.').reduce((value, part) => (value << BigInt(8)) | BigInt(part), BigInt(0))
  let text = ip
  const tail = text.match(/\d+\.\d+\.\d+\.\d+$/)?.[0]
  if (tail) {
    const value = ipValue(tail)
    text = text.slice(0, -tail.length) + `${(value >> BigInt(16)).toString(16)}:${(value & BigInt(65535)).toString(16)}`
  }
  const [left, right] = text.split('::')
  const head = left ? left.split(':') : []
  const end = right ? right.split(':') : []
  const groups = text.includes('::') ? [...head, ...Array(8 - head.length - end.length).fill('0'), ...end] : head
  return groups.reduce((value, part) => (value << BigInt(16)) | BigInt(`0x${part}`), BigInt(0))
}

export function normalizeIp(raw: string | undefined): string {
  let text = (raw || '').trim()
  if (text.startsWith('[')) text = text.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1')
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(text)) text = text.slice(0, text.lastIndexOf(':'))
  text = text.split('%')[0]
  const family = isIP(text)
  if (!family) return ''
  if (family === 4) return text
  const value = ipValue(text)
  if (value >> BigInt(32) === BigInt(65535)) {
    return [24, 16, 8, 0].map((shift) => String((value >> BigInt(shift)) & BigInt(255))).join('.')
  }
  return new URL(`http://[${text}]/`).hostname.slice(1, -1)
}

export function isTrustedProxy(ip: string, cidrs: string[]): boolean {
  const address = normalizeIp(ip)
  if (!address) return false
  return cidrs.some((cidr) => {
    const parts = cidr.trim().split('/')
    const base = normalizeIp(parts[0])
    if (!base || parts.length > 2 || isIP(address) !== isIP(base)) return false
    const width = isIP(base) === 4 ? 32 : 128
    if (parts.length === 2 && !/^\d+$/.test(parts[1])) return false
    const bits = parts.length === 2 ? Number(parts[1]) : width
    if (bits < 0 || bits > width) return false
    const shift = BigInt(width - bits)
    return ipValue(address) >> shift === ipValue(base) >> shift
  })
}

export function resolveClientIp(peerIp: string, forwardedFor: string | undefined, cidrs: string[]): string {
  const peer = normalizeIp(peerIp)
  if (!forwardedFor || !isTrustedProxy(peer, cidrs)) return peer
  const chain = forwardedFor.split(',').map((item) => normalizeIp(item))
  if (chain.some((ip) => !ip)) return peer
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isTrustedProxy(chain[i], cidrs)) return chain[i]
  }
  return chain[0] || peer
}

const CRAWLER_RULES = [
  {
    vendor: 'Google',
    category: 'search_bot',
    tokens: ['Googlebot-Image', 'Googlebot-Video', 'Googlebot'],
    purpose: '搜索抓取',
    evidence: 'https://developers.google.cn/crawling/docs/crawlers-fetchers/google-common-crawlers'
  },
  {
    vendor: 'Microsoft',
    category: 'search_bot',
    tokens: ['bingbot'],
    purpose: '搜索抓取',
    evidence: 'https://blogs.bing.com/webmaster/april-2022/Announcing-user-agent-change-for-Bing-crawler-bingbot'
  },
  {
    vendor: 'Baidu',
    category: 'search_bot',
    tokens: ['Baiduspider-image', 'Baiduspider'],
    purpose: '搜索策略标识',
    evidence: 'https://www.baidu.com/robots.txt'
  },
  {
    vendor: 'Sogou',
    category: 'search_bot',
    tokens: ['Sogou web spider', 'Sogou inst spider'],
    purpose: '搜索抓取',
    evidence: 'https://help.sogou.com/guide.html#3'
  },
  {
    vendor: '360',
    category: 'search_bot',
    tokens: ['360Spider-Image', '360Spider-Video', '360Spider'],
    purpose: '搜索抓取',
    evidence: 'https://www.so.com/help/help_3_2.html'
  },
  {
    vendor: 'Shenma',
    category: 'search_bot',
    tokens: ['yisouspider'],
    purpose: '历史搜索声明',
    evidence: 'https://zhanzhang.sm.cn/open/optimizaGuide'
  },
  {
    vendor: 'ByteDance',
    category: 'search_bot',
    tokens: ['Bytespider'],
    purpose: '头条搜索抓取',
    evidence: 'https://m.toutiao.com/group/6759451726496940557/'
  },
  {
    vendor: 'Apple',
    category: 'search_bot',
    tokens: ['Applebot'],
    purpose: '搜索等用途抓取',
    evidence: 'https://support.apple.com/en-us/119829'
  },
  {
    vendor: 'OpenAI',
    category: 'ai_bot',
    tokens: ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User'],
    purpose: '分别为搜索/训练候选/用户触发',
    evidence: 'https://developers.openai.com/api/docs/bots'
  },
  {
    vendor: 'Anthropic',
    category: 'ai_bot',
    tokens: ['Claude-SearchBot', 'ClaudeBot', 'Claude-User'],
    purpose: '分别为搜索/训练候选/用户触发',
    evidence:
      'https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler'
  },
  {
    vendor: 'Perplexity',
    category: 'ai_bot',
    tokens: ['PerplexityBot', 'Perplexity-User'],
    purpose: '分别为搜索/用户触发',
    evidence: 'https://docs.perplexity.ai/docs/resources/perplexity-crawlers'
  },
  {
    vendor: 'Kimi',
    category: 'ai_bot',
    tokens: ['Kimi-SearchBot', 'KimiBot', 'Kimi-User'],
    purpose: '分别为搜索/训练候选/用户触发',
    evidence: 'https://www.kimi.com/policies/kimi-crawlers'
  }
] as const

export function classifyAgent(ua: string): AgentInfo {
  const unknown: AgentInfo = { accessCategory: 'unknown', browserName: 'unknown', vendor: 'unknown' }
  for (const rule of CRAWLER_RULES) {
    for (const token of rule.tokens) {
      if (new RegExp(`(?:^|[^a-z0-9_-])${token}(?=$|[^a-z0-9_-])`, 'i').test(ua)) {
        return { ...unknown, accessCategory: rule.category, agentToken: token, vendor: rule.vendor }
      }
    }
  }
  if (/bot|spider|crawler|extended/i.test(ua)) return unknown
  for (const [name, pattern] of [
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+)(?=[^\d.]|$)/]
  ] as const) {
    if (name === 'Safari' && !ua.includes('Safari/')) continue
    const match = ua.match(pattern)
    if (match)
      return { ...unknown, accessCategory: 'browser', browserName: name, browserVersion: match[1].slice(0, 32) }
  }
  return unknown
}

export function classifyResource(rawPath: string, slug = ''): ResourceType {
  let path = rawPath.replace(/\/+$/, '') || '/'
  if (slug && path.startsWith(`/${slug}/`)) path = path.slice(slug.length + 1)
  if (path === '/llms.txt' || path === '/llms-full.txt') return 'llms'
  if (/^\/sitemap(?:[-_][a-zA-Z0-9]+)*\.xml$/.test(path)) return 'sitemap'
  if (path === '/robots.txt') return 'robots'
  if (path.endsWith('/_payload.json')) return 'payload'
  if (
    path.startsWith('/_nuxt/') ||
    path.startsWith('/static/') ||
    /\.(?:m?js|css|map|jpe?g|png|gif|webp|avif|svg|ico|woff2?|ttf|eot|pdf|mp4|webm|mp3)$/i.test(path)
  )
    return 'asset'
  return extname(path) && !/\.html?$/i.test(path) ? 'other' : 'page'
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function safeHost(value: string): string {
  if (!value || value.length > 128 || /[\s/@?#\\]/.test(value)) return ''
  try {
    const url = new URL(`http://${value}/`)
    return url.hostname ? value : ''
  } catch {
    return ''
  }
}

function safeReferer(value: string): string {
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) ? `${url.protocol}//${url.host}${url.pathname}`.slice(0, 512) : ''
  } catch {
    return ''
  }
}

export function snapshotAccess(
  req: IncomingMessage,
  cidrs: string[],
  slug = ''
): Omit<AccessInfo, 'durationMs' | 'completion'> {
  const peerIp = normalizeIp(req.socket.remoteAddress)
  const trusted = isTrustedProxy(peerIp, cidrs)
  const rawHost = header(req, 'host')
  const host = (
    trusted && header(req, 'x-forwarded-host') ? header(req, 'x-forwarded-host').split(',')[0].trim() : rawHost
  ).slice(0, 128)
  const forwardedProto = trusted ? header(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase() : ''
  const scheme = ['http', 'https'].includes(forwardedProto)
    ? forwardedProto
    : 'encrypted' in req.socket && req.socket.encrypted
      ? 'https'
      : 'http'
  const path = (req.url || '/').split(/[?#]/)[0].slice(0, 512)
  const userAgent = header(req, 'user-agent').slice(0, 512)
  return {
    host,
    path,
    method: (req.method || 'GET').slice(0, 8),
    requestUrl:
      safeHost(host) && path.startsWith('/') && !path.startsWith('//')
        ? `${scheme}://${host}${path}`.slice(0, 768)
        : '',
    peerIp,
    clientIp: resolveClientIp(peerIp, header(req, 'x-forwarded-for'), cidrs),
    userAgent,
    referer: safeReferer(header(req, 'referer')),
    ...classifyAgent(userAgent),
    resourceType: classifyResource(path, slug),
    occurredAt: new Date().toISOString()
  }
}

export function observeAccess(
  req: IncomingMessage,
  res: ServerResponse,
  record: (info: AccessInfo) => void,
  cidrs: string[],
  slug = ''
): void {
  const started = performance.now()
  const snapshot = snapshotAccess(req, cidrs, slug)
  let recorded = false
  const complete = (finished: boolean) => {
    if (recorded) return
    recorded = true
    res.removeListener('finish', onFinish)
    res.removeListener('close', onClose)
    record({
      ...snapshot,
      durationMs: Math.max(0, Math.floor(performance.now() - started)),
      completion: finished ? 'finished' : 'aborted',
      status: finished || res.headersSent ? res.statusCode : undefined
    })
  }
  const onFinish = () => complete(true)
  const onClose = () => complete(res.writableFinished)
  res.once('finish', onFinish)
  res.once('close', onClose)
}

interface SaveOptions {
  apiBase: string
  token: string
  send: (
    url: string,
    options: { method: 'POST'; headers: Record<string, string>; body: AccessInfo }
  ) => Promise<unknown>
}

async function processAccess(info: AccessInfo, options: SaveOptions): Promise<void> {
  try {
    if (!options.apiBase || !options.token) return
    await options.send(`${options.apiBase.replace(/\/+$/, '')}/internal/access-events`, {
      method: 'POST',
      headers: { 'x-internal-token': options.token },
      body: info
    })
  } catch {
    return
  }
}

export function recordAccess(info: AccessInfo, options: SaveOptions): void {
  void processAccess(info, options)
}
