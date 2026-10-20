/**
 * AI 爬虫 UA 清单与默认策略
 * 依据 §6 GEO 要求：默认放行全部已知 AI 爬虫（很多站点误禁 AI 爬虫，这是 GEO 最大坑）
 */
const DEFAULT_ALLOWED_AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Bytespider',
  'Applebot-Extended',
  'CCBot',
  'Amazonbot',
  'DuckAssistBot',
  'YouBot',
  'Diffbot',
  'QwenBot',
  'Baiduspider-render',
  'ErnieBot'
] as const

/** 站点 robots 策略输入 */
export interface RobotsPolicy {
  /** 是否放行全部已知 AI 爬虫 */
  allowAllAi: boolean
  /** 显式屏蔽的 UA */
  blockedAgents: string[]
  /** 额外放行的 UA（allowAllAi 为 false 时即放行清单本体） */
  extraAllowedAgents: string[]
}

/** 已知 AI 爬虫 UA 关键字清单 */
export function buildDefaultAgents(): string[] {
  return [...DEFAULT_ALLOWED_AI_AGENTS]
}

/** 判断 UA 是否属于 AI 爬虫 */
export function matchAiCrawler(ua: string | undefined | null): string | null {
  if (!ua) return null
  const target = ua.toLowerCase()
  for (const agent of DEFAULT_ALLOWED_AI_AGENTS) {
    if (target.includes(agent.toLowerCase())) return agent
  }
  return null
}

/** 站点是否显式声明了 AI 爬虫策略（09 §10.4「robots 缺 AI 爬虫策略说明」阻断项判定） */
export function hasAiCrawlerPolicy(policy: Partial<RobotsPolicy> | null | undefined): boolean {
  if (!policy) return false
  return (
    Boolean(policy.allowAllAi) ||
    (policy.extraAllowedAgents?.length ?? 0) > 0 ||
    (policy.blockedAgents?.length ?? 0) > 0
  )
}

/** 去重（忽略大小写、去空白），保留首次出现顺序 */
function normalizeAgents(list: string[] | undefined | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list ?? []) {
    const value = String(item ?? '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function isDefaultAiAgent(agent: string): boolean {
  const key = agent.toLowerCase()
  return DEFAULT_ALLOWED_AI_AGENTS.some((item) => item.toLowerCase() === key)
}

/**
 * robots.txt 头部说明段：AI 爬虫策略
 * 09 §10.4 把「robots 缺 AI 爬虫策略说明」列为阻断项，§12.4 列为验收项，
 * 因此产物必须自带可读的策略说明，而不只是一堆 Allow / Disallow。
 */
function buildPolicyComment(allowed: string[], blocked: string[]): string[] {
  const aiAgents = allowed.filter(isDefaultAiAgent)
  const otherAgents = allowed.filter((item) => !isDefaultAiAgent(item))
  const lines = [
    '# 抓取策略说明（AI / GEO）',
    '# 本站面向生成式引擎优化（GEO）：默认放行已知 AI 爬虫，允许其抓取并引用站内公开内容。',
    `# 已放行 AI 爬虫 ${aiAgents.length} 个：${aiAgents.join(', ')}`,
    `# 已屏蔽 ${blocked.length} 个：${blocked.length ? blocked.join(', ') : '无'}`
  ]
  if (otherAgents.length) {
    lines.push(`# 额外放行 ${otherAgents.length} 个：${otherAgents.join(', ')}`)
  }
  lines.push(
    '# 引用要求：以页面正文为准，保留页面标题、来源链接与编审信息；',
    '# 站内不含患者个人信息，不含疗效承诺与前后对比，诊疗方案以医师面诊结论为准。'
  )
  return lines
}

/** 生成 robots.txt 内容：按站点策略放行或屏蔽 AI 爬虫（UA 自动去重） */
export function buildRobotsTxt(policy: Partial<RobotsPolicy>): string {
  const blocked = normalizeAgents(policy.blockedAgents)
  const blockedKeys = new Set(blocked.map((item) => item.toLowerCase()))
  const allowed = normalizeAgents(
    policy.allowAllAi ? [...DEFAULT_ALLOWED_AI_AGENTS, ...(policy.extraAllowedAgents ?? [])] : policy.extraAllowedAgents
  ).filter((agent) => !blockedKeys.has(agent.toLowerCase()))

  const lines: string[] = [...buildPolicyComment(allowed, blocked), '']
  lines.push('User-agent: *', 'Allow: /', '')
  for (const agent of allowed) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '')
  }
  for (const agent of blocked) {
    lines.push(`User-agent: ${agent}`, 'Disallow: /', '')
  }
  lines.push('Sitemap: /sitemap.xml')
  return lines.join('\n')
}
