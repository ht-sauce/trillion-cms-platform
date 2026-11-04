#!/usr/bin/env node
/**
 * 富林泛泰工程案例采集脚本（repair-case-studies-module · Task 5）
 *
 * 数据源：https://sea.forintech.com/zh/casestudies（Wix 站点）
 * 目标：把「列表页卡片 + 详情页标题/导语/正文/图片」采集为 CaseStudy 记录，
 *       图片按服务端静态文件规则落盘（uploads/<yyyy>/<mm>/<uuid>.<ext>）并登记 StaticFile，
 *       正文生成与新闻同口径的结构化块 bodyBlocks（段落 / 图片按页面顺序）。
 *
 * 设计约束：
 * - 默认 --dry-run：只抓取与打印计划（案例数 / 图片数 / 行业命中），不写库、不落文件
 * - --apply 才下载图片、写 StaticFile、upsert CaseStudy
 * - 图片只取案例内容图（wix media 的 ecd1b0_ 资源），站点 logo / 背景等 chrome 图一律跳过
 * - 行业只认分类表：映射来自 scripts/data/case-industry-map.json，缺映射直接中止（不自动建分类）
 * - 请求限频 ≥2s，失败重试 ≤2 次，不对目标站造成压力
 * - 存量案例按标题（规范化后）匹配，保留原 slug / pageId；匹配不到才新建
 *
 * 用法：
 *   node scripts/data/import-forintech-cases.mjs                 # 默认 dry-run
 *   node scripts/data/import-forintech-cases.mjs --audit-industry # 只审计库里行业命中情况
 *   node scripts/data/import-forintech-cases.mjs --apply          # 真正写库并落图片
 *   node scripts/data/import-forintech-cases.mjs --apply --env test
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const SITE_UPLOAD_DIR = path.join(ROOT, 'apps/server/uploads')
const PUBLIC_PREFIX = '/static'
const SOURCE_TAG = '富林泛泰官网 · 工程案例'
const LIST_URL = 'https://sea.forintech.com/zh/casestudies'
const REQUEST_GAP_MS = 2000
const RETRY_MAX = 2
/** 案例内容图前缀（Wix 站点自身的 logo / 背景是 be719b_，不属于案例内容） */
const CONTENT_IMAGE_PREFIX = 'ecd1b0_'

const argv = process.argv.slice(2)
const hasFlag = (flag) => argv.includes(flag)
const readArg = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const APPLY = hasFlag('--apply')
const AUDIT_ONLY = hasFlag('--audit-industry')
const NORMALIZE_INDUSTRY = hasFlag('--normalize-industry')
const SITE_SLUG = readArg('--site') || 'forintech'
const APP_ENV = readArg('--env') || 'development'

// ---------------- 环境与 Prisma ----------------

/** 从 env/.env.<环境> 读变量（脚本独立运行，不依赖 pnpm 注入） */
function loadEnv(appEnv) {
  const file = path.join(ROOT, 'env', `.env.${appEnv}`)
  if (!fs.existsSync(file)) throw new Error(`环境文件不存在：${path.relative(ROOT, file)}`)
  const vars = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match || line.trim().startsWith('#')) continue
    vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  const url =
    vars.DATABASE_URL ||
    `mysql://${encodeURIComponent(vars.DB_USER)}:${encodeURIComponent(vars.DB_PASSWORD || '')}@${vars.DB_HOST}:${vars.DB_PORT || 3306}/${vars.DB_NAME}`
  return { vars, databaseUrl: url }
}

async function createPrisma(databaseUrl) {
  process.env.DATABASE_URL = databaseUrl
  const require = createRequire(path.join(ROOT, 'apps/server/package.json'))
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  return prisma
}

// ---------------- 抓取 ----------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 带重试与限频的 GET（返回 HTML 文本） */
async function fetchHtml(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (error) {
    if (attempt >= RETRY_MAX) throw error
    await sleep(REQUEST_GAP_MS * (attempt + 1))
    return fetchHtml(url, attempt + 1)
  }
}

/** HTML 实体解码（只处理采集会遇到的少量实体） */
function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
}

/** 去标签取可见文本（保留换行） */
function toText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/** 标题规范化（用于与库里存量案例匹配） */
function normalizeTitle(title) {
  return decodeEntities(title)
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[·・]/g, '')
    .replace(/[，,。.]$/, '')
    .toLowerCase()
}

/**
 * 解析列表页：以「案例详情链接」为锚点，每个唯一链接取其后最近的 h2 作为标题。
 * 列表页里标题与「了解更多」同处一个 h2，需先剥离；同一链接会出现多次（图 / 标题 / 按钮），按 href 去重。
 */
function parseList(html) {
  const linkRe =
    /href="(https:\/\/sea\.forintech\.com\/zh\/(?:casestudies\/[^"#?]+|copy-of-case[a-z0-9-]*|case-study-[a-z0-9-]+))"/g
  const order = []
  const seen = new Set()
  let match
  while ((match = linkRe.exec(html))) {
    const href = match[1]
    if (href.replace(/\/$/, '') === LIST_URL) continue
    if (seen.has(href)) continue
    seen.add(href)
    /** 卡片结构为「图片(链接) → 标题 h2(链接) → 了解更多(链接)」，标题在首次出现之后 */
    const after = html.slice(match.index, match.index + 4000)
    const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(after)
    const title = h2
      ? toText(h2[1])
          .replace(/了解更\s*多|➔/g, '')
          .trim()
      : ''
    if (!title || title.length < 2) continue
    order.push({ title, href })
  }
  return order
}

/**
 * 解析详情页：按文档顺序产出 token 流（text / image），
 * 再切成「标题 / 副标题或导语 / 正文段落 / 内容图」。
 * 只保留案例内容图（ecd1b0_ 前缀），原图地址去掉 Wix 的 /v1/fill 变换参数。
 */
function parseDetail(html, expectedTitle) {
  const tokens = []
  const tokenRe =
    /data-testid="richTextElement"[^>]*>([\s\S]*?)<\/(?:div|h[1-6]|p|span)>|<img\b[^>]*(?:src|srcSet|data-src)="(https:\/\/static\.wixstatic\.com\/media\/[^"']+?)"/g
  let match
  while ((match = tokenRe.exec(html))) {
    if (match[1]) {
      const text = toText(match[1]).replace(/\n+/g, '\n')
      if (text) tokens.push({ type: 'text', text })
      continue
    }
    const url = decodeURIComponent(match[2])
    if (!url.includes(CONTENT_IMAGE_PREFIX)) continue
    const original = url.replace(/\/v1\/.*$/i, '')
    if (!tokens.some((token) => token.type === 'image' && token.url === original)) {
      tokens.push({ type: 'image', url: original })
    }
  }

  /** 站点页脚等固定文案，不属于案例正文 */
  const NOISE = [/^关注我们$/, /^菜单$/, /^接触$/, /^设计者/, /^福林科技/, /^版权所有/, /^上一/, /^下一页$/, /^​$/]

  const titleNorm = normalizeTitle(expectedTitle)
  const paragraphs = []
  const images = []
  let subtitle = ''
  let titleSeen = false

  for (const token of tokens) {
    if (token.type === 'image') {
      images.push(token.url)
      continue
    }
    const text = token.text.trim()
    if (!text || NOISE.some((re) => re.test(text))) continue
    /** 第一个与列表标题一致的文本就是详情页标题，跳过 */
    if (!titleSeen && (normalizeTitle(text) === titleNorm || text === expectedTitle)) {
      titleSeen = true
      continue
    }
    /** 紧跟标题的短句视为副标题（详情页 hero 下方一行） */
    if (!subtitle && !paragraphs.length && text.length <= 40 && images.length <= 1) {
      subtitle = text
      continue
    }
    paragraphs.push(text)
    if (paragraphs.length >= 40) break
  }

  const [cover, ...rest] = images
  return { cover: cover || '', subtitle, paragraphs, images: rest }
}

// ---------------- 落库 ----------------

/** 图片扩展名与 MIME 推断 */
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

function extFromUrl(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase()
  if (MIME_BY_EXT[fromUrl]) return fromUrl
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('gif')) return '.gif'
  return '.jpg'
}

/**
 * 图片下载用的域名替换：Wix 的资源直链 host（static.wixstatic.com）在部分网络下被重置，
 * images.wixstatic.com 是同一资源池的可用入口，内容一致。
 */
function toDownloadUrl(url) {
  return url.replace('https://static.wixstatic.com/', 'https://images.wixstatic.com/')
}

/** 下载图片并按 StaticFilesService 规则落盘 + 登记 StaticFile，返回 publicUrl */
async function downloadImage(prisma, siteId, url, caption, attempt = 0) {
  const existing = await prisma.staticFile.findFirst({
    where: { siteId, source: SOURCE_TAG, caption },
    select: { publicUrl: true }
  })
  if (existing) return existing.publicUrl

  try {
    const res = await fetch(toDownloadUrl(url), {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', referer: LIST_URL }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await saveImage(prisma, siteId, url, caption, res)
  } catch (error) {
    if (attempt >= RETRY_MAX)
      throw new Error(`图片下载失败：${url}（${error instanceof Error ? error.message : error}）`)
    await sleep(1000 * (attempt + 1))
    return downloadImage(prisma, siteId, url, caption, attempt + 1)
  }
}

/** 图片响应 → 落盘 + StaticFile 记录 */
async function saveImage(prisma, siteId, url, caption, res) {
  const contentType = res.headers.get('content-type') || ''
  const buffer = Buffer.from(await res.arrayBuffer())
  const ext = extFromUrl(url, contentType)
  const mimeType = MIME_BY_EXT[ext] || contentType || 'image/jpeg'

  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const name = `${randomUUID()}${ext}`
  const relativeDir = `${year}/${month}`
  const targetDir = path.join(SITE_UPLOAD_DIR, relativeDir)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(path.join(targetDir, name), buffer)

  const storagePath = `uploads/${relativeDir}/${name}`
  const publicUrl = `${PUBLIC_PREFIX}/${relativeDir}/${name}`
  const originalName = decodeURIComponent(new URL(url).pathname.split('/').pop() || name)

  await prisma.staticFile.create({
    data: {
      siteId,
      originalName,
      storagePath,
      publicUrl,
      mimeType,
      sizeBytes: buffer.length,
      caption,
      source: SOURCE_TAG
    }
  })
  return publicUrl
}

/** 由详情页 URL 派生站内 slug：取末段、去掉 Wix 的 copy-of- 前缀（保持可读且稳定） */
function slugFromUrl(url) {
  const last = new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || ''
  return last
    .replace(/^copy-of-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

/** 正文块：段落 + 图片按页面顺序 */
function buildBodyBlocks(paragraphs, imageUrls) {
  const blocks = paragraphs.map((text) => ({ kind: 'paragraph', text }))
  for (const src of imageUrls) blocks.push({ kind: 'image', src })
  return blocks
}

// ---------------- 主流程 ----------------

async function main() {
  const { databaseUrl, vars } = loadEnv(APP_ENV)
  const prisma = await createPrisma(databaseUrl)
  console.log(`[采集] 环境 ${APP_ENV} · 库 ${vars.DB_NAME} · 模式 ${APPLY ? 'APPLY（写库）' : 'DRY-RUN（不写库）'}`)

  const site = await prisma.site.findFirst({ where: { slug: SITE_SLUG }, select: { id: true, name: true } })
  if (!site) throw new Error(`未找到站点 slug=${SITE_SLUG}`)
  const siteId = site.id
  const industries = await prisma.productIndustry.findMany({ where: { siteId }, orderBy: { sort: 'asc' } })
  const industryByName = new Map(industries.map((item) => [item.name, item]))

  const mapPath = path.join(ROOT, 'scripts/data/case-industry-map.json')
  const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  const industryMap = Object.fromEntries(Object.entries(rawMap).filter(([key]) => !key.startsWith('_')))
  /** 标题规范化后建索引：容忍数据源标题里的空格差异（如「楚能智能 工厂」） */
  const mapByNorm = new Map(Object.entries(industryMap).map(([key, value]) => [normalizeTitle(key), value]))
  const entryOf = (title) => mapByNorm.get(normalizeTitle(title))

  const existingCases = await prisma.caseStudy.findMany({
    where: { siteId },
    select: { id: true, title: true, industry: true, industryId: true, slug: true, sort: true, sourceUrl: true }
  })
  const existingByTitle = new Map(existingCases.map((row) => [normalizeTitle(row.title), row]))
  /** 映射条目 → 库里存量案例：优先 match 别名，其次标题精确 */
  const findExisting = (title, entry) => {
    const alias = entry?.match
    if (alias && existingByTitle.has(normalizeTitle(alias))) return existingByTitle.get(normalizeTitle(alias))
    return existingByTitle.get(normalizeTitle(title)) ?? null
  }

  // ---------------- 行业审计（只读） ----------------
  if (AUDIT_ONLY) {
    console.log(`\n[审计] 分类表 ${industries.length} 项：${industries.map((item) => item.name).join(' / ')}`)
    const hit = new Map()
    const miss = []
    for (const row of existingCases) {
      /** 反向找映射条目：条目 match 或标题与本行一致 */
      const entry = Object.entries(industryMap).find(([key, value]) => {
        const alias = value?.match
        return (
          normalizeTitle(alias || key) === normalizeTitle(row.title) ||
          normalizeTitle(key) === normalizeTitle(row.title)
        )
      })
      const target = entry ? entry[1].industry : undefined
      if (target === undefined) {
        miss.push({ title: row.title, current: row.industry, reason: '映射表中缺少该案例' })
        continue
      }
      if (target === null) {
        miss.push({ title: row.title, current: row.industry, reason: '映射表中标记为暂不分类（需人工决定）' })
        continue
      }
      if (!industryByName.has(target)) {
        miss.push({ title: row.title, current: row.industry, reason: `映射目标「${target}」不在分类表` })
        continue
      }
      hit.set(target, (hit.get(target) ?? 0) + 1)
    }
    console.log('\n[审计] 已命中（按映射目标统计）：')
    for (const item of industries) {
      const count = hit.get(item.name) ?? 0
      if (count) console.log(`  ✓ ${item.name}  ${count} 条`)
    }
    console.log('\n[审计] 未命中（需人工确认，脚本不自动建分类）：')
    if (!miss.length) console.log('  （无）')
    for (const item of miss) {
      console.log(`  ✗ ${item.title} | 当前行业=${JSON.stringify(item.current)} | ${item.reason}`)
    }
    await prisma.$disconnect()
    return
  }

  // ---------------- 存量脏分类归一（--normalize-industry） ----------------
  if (NORMALIZE_INDUSTRY) {
    /** 历史自由文本 → 分类表（仅这批已知脏值；未知值一律不动，交人工） */
    const LEGACY = {
      食品加工: '食品&饮料',
      电子制造: '电子智造',
      医药净化: '医药及净化车间',
      停车场与坡道: '停车场'
    }
    const planRows = []
    const unknown = []
    for (const row of existingCases) {
      const target = LEGACY[row.industry]
      if (!target) {
        if (row.industry) unknown.push(row)
        continue
      }
      const industry = industryByName.get(target)
      if (!industry) {
        unknown.push(row)
        continue
      }
      planRows.push({ row, industryId: industry.id, name: industry.name })
    }

    console.log(`\n[归一] 待回填 ${planRows.length} 条：`)
    for (const item of planRows) {
      console.log(`  ${item.row.title} | ${JSON.stringify(item.row.industry)} → ${item.name}`)
    }
    console.log('[归一] 未处理（行业为空或非已知脏值，保持原样）：')
    for (const row of unknown) console.log(`  - ${row.title} | ${JSON.stringify(row.industry)}`)

    if (!APPLY) {
      console.log('\n[DRY-RUN] 未写库。确认无误后加 --apply 执行。')
      await prisma.$disconnect()
      return
    }
    for (const item of planRows) {
      await prisma.caseStudy.update({
        where: { id: item.row.id },
        data: { industryId: item.industryId, industry: item.name }
      })
    }
    console.log(`\n[归一] 已回填 ${planRows.length} 条。`)
    await prisma.$disconnect()
    return
  }

  // ---------------- 抓列表页 ----------------
  console.log(`\n[采集] 列表页 ${LIST_URL}`)
  const listHtml = await fetchHtml(LIST_URL)
  const cards = parseList(listHtml)
  console.log(`[采集] 列表解析到 ${cards.length} 个案例`)
  if (!cards.length) throw new Error('列表页未解析到案例，页面结构可能已变更')

  /** 行业映射校验：任何一张卡片缺映射或映射目标不存在都中止（不自动建分类） */
  const mappingErrors = []
  for (const card of cards) {
    const entry = entryOf(card.title)
    if (!entry) {
      mappingErrors.push(`「${card.title}」在 case-industry-map.json 中缺少映射`)
      continue
    }
    if (entry.industry !== null && !industryByName.has(entry.industry)) {
      mappingErrors.push(`「${card.title}」映射到「${entry.industry}」，该分类不在分类表`)
    }
  }
  if (mappingErrors.length) {
    console.error('\n[中止] 行业映射不完整，请先补齐 scripts/data/case-industry-map.json：')
    mappingErrors.forEach((line) => console.error(`  - ${line}`))
    await prisma.$disconnect()
    process.exitCode = 1
    return
  }

  // ---------------- 抓详情页 ----------------
  const plan = []
  for (const [index, card] of cards.entries()) {
    await sleep(REQUEST_GAP_MS)
    process.stdout.write(`\r[采集] 详情页 ${index + 1}/${cards.length} …`)
    const detailHtml = await fetchHtml(card.href)
    const detail = parseDetail(detailHtml, card.title)
    const entry = entryOf(card.title)
    plan.push({
      title: card.title,
      href: card.href,
      industryId: entry.industry ? (industryByName.get(entry.industry)?.id ?? null) : null,
      industryName: entry.industry ?? '',
      existing: findExisting(card.title, entry),
      ...detail
    })
  }
  console.log('')

  // ---------------- 计划输出 ----------------
  const imageCount = plan.reduce((sum, item) => sum + (item.cover ? 1 : 0) + item.images.length, 0)
  let updateCount = 0
  let createCount = 0
  console.log('\n[计划] 案例明细：')
  for (const item of plan) {
    const action = item.existing ? '更新' : '新建'
    if (item.existing) updateCount += 1
    else createCount += 1
    console.log(
      `  ${action} | ${item.title} | 行业=${item.industryName || '未分类'} | 段落=${item.paragraphs.length} | 图=${(item.cover ? 1 : 0) + item.images.length}`
    )
    if (item.paragraphs.length === 0) console.log('    ⚠ 未解析到正文段落')
  }
  console.log(
    `\n[计划] 案例 ${plan.length} 条（更新 ${updateCount} / 新建 ${createCount}）· 图片 ${imageCount} 张 · 正文段落 ${plan.reduce((sum, item) => sum + item.paragraphs.length, 0)} 段`
  )

  if (!APPLY) {
    console.log('\n[DRY-RUN] 未写库、未下载图片。确认无误后加 --apply 执行。')
    await prisma.$disconnect()
    return
  }

  // ---------------- 写库 ----------------
  console.log('\n[写入] 开始下载图片并写入数据库 …')
  let done = 0
  for (const item of plan) {
    done += 1
    process.stdout.write(`\r[写入] ${done}/${plan.length} ${item.title.slice(0, 24)}`)

    let cover = ''
    if (item.cover) {
      cover = await downloadImage(prisma, siteId, item.cover, `${item.title} · 封面`)
      await sleep(300)
    }
    const bodyImageUrls = []
    for (const [imageIndex, url] of item.images.entries()) {
      bodyImageUrls.push(await downloadImage(prisma, siteId, url, `${item.title} · 正文图 ${imageIndex + 1}`))
      await sleep(300)
    }

    const bodyBlocks = buildBodyBlocks(item.paragraphs, bodyImageUrls)
    const body = item.paragraphs.join('\n')
    const lead = item.subtitle || item.paragraphs[0] || ''

    const shared = {
      industryId: item.industryId,
      industry: item.industryName,
      lead,
      img: cover || (item.existing ? undefined : ''),
      bgImage: cover || '',
      body,
      bodyBlocks,
      images: bodyImageUrls.map((src, index) => ({ img: src, caption: `项目画面 ${index + 1}` })),
      sourceUrl: item.href
    }

    if (item.existing) {
      await prisma.caseStudy.update({
        where: { id: item.existing.id },
        data: { ...shared, img: cover || undefined, bgImage: cover || undefined }
      })
      continue
    }

    const max = await prisma.caseStudy.aggregate({ where: { siteId }, _max: { sort: true } })
    /** slug 由 URL 派生；极端情况下与已有记录冲突时追加序号 */
    let slug = slugFromUrl(item.href)
    if (!slug) slug = `case-${randomUUID().slice(0, 8)}`
    if (await prisma.caseStudy.findUnique({ where: { siteId_slug: { siteId, slug } }, select: { id: true } })) {
      slug = `${slug}-${randomUUID().slice(0, 4)}`
    }
    await prisma.caseStudy.create({
      data: {
        siteId,
        title: item.title,
        ...shared,
        img: cover,
        bgImage: cover,
        slug,
        status: 'published',
        sort: (max._max.sort ?? 0) + 1
      }
    })
  }
  console.log('\n[写入] 完成。请到后台「成功案例」页点一次「重建」或调用 POST /catalog/cases/rebuild 重新派生详情页。')
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(`\n[失败] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
