/**
 * 新闻/问答表回填脚本：把「Page + 块数据」形态的新闻/问答详情页回填进独立数据表
 * （NewsArticle / FaqItem，表为管理源、页面是发布产物，见 docs/spec/04-data-model.md §8）。
 *
 * 数据来源（siteId=3，xian-renai-skin）：
 *   - /news/* 详情页 → NewsArticle：title=page.title、summary=page.summary、
 *     content=article-body.blocks[].text 按 \n 拼接、publishDate=article-meta.date、
 *     slug=去掉 /news/ 前缀、status=page.status、pageId=page.id
 *   - /faq/qNNN 详情页 → FaqItem：question=faq-detail.question、category=faq-detail.cat、
 *     answer=faq-detail.paragraphs 按 \n 拼接、slug=去掉 /faq/ 前缀、status=page.status、pageId=page.id
 *
 * 幂等：按 (siteId, slug) 判重，已存在的记录整体跳过，可重复执行。
 * 预期结果（siteId=3）：NewsArticle 7 条、FaqItem 102 条。
 *
 * 依赖：仅 @prisma/client + node 内置模块。连接串取 process.env.DATABASE_URL，
 * 缺省时由 DB_* 变量拼装；例如本地：
 *   DATABASE_URL=mysql://root:111@127.0.0.1:3306/trillionCms node apps/server/scripts/backfill-news-faq-tables.mjs
 */
import { PrismaClient } from '@prisma/client'

// ---------- 连接串（DATABASE_URL 优先，其次 DB_* 拼装） ----------
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT || '3306'
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD ?? ''
  const name = process.env.DB_NAME
  if (!host || !user || !name) {
    console.error('缺少连接配置：请设置 DATABASE_URL，或提供 DB_HOST / DB_USER / DB_NAME（可含 DB_PORT / DB_PASSWORD）')
    process.exit(1)
  }
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`
}

const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } })

/** 回填目标站点 */
const SITE_ID = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : '3'

// ---------- 块数据读取（与服务端 normalizeBlockInstances 同口径的最小实现） ----------

/** 取页面块实例数组（兼容历史 { type } 形态） */
function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return []
  return blocks
    .filter((item) => !!item && typeof item === 'object')
    .map((item) => ({
      key: String(item.key ?? item.type ?? ''),
      data: item.data ?? item
    }))
}

/** 从块数组里读第一个指定 key 的块数据（不论启用与否） */
function readBlockData(blocks, key) {
  const found = normalizeBlocks(blocks).find((item) => item.key === key)
  return found ? found.data : null
}

/** 纯文本按换行拆段落（去空行、去首尾空白），与 news-faq-sync.service.ts 的 splitParagraphs 一致 */
function splitParagraphs(content) {
  return String(content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

// ---------- 回填逻辑 ----------

/** /news/* 详情页 → NewsArticle */
async function backfillArticles() {
  const pages = await prisma.page.findMany({
    where: { siteId: SITE_ID, path: { startsWith: '/news/' } },
    select: { id: true, title: true, summary: true, status: true, path: true, blocks: true },
    orderBy: { id: 'asc' }
  })

  let created = 0
  let skipped = 0
  for (const page of pages) {
    const slug = String(page.path ?? '').slice('/news/'.length)
    if (!slug) continue
    const exists = await prisma.newsArticle.findFirst({ where: { siteId: SITE_ID, slug }, select: { id: true } })
    if (exists) {
      skipped += 1
      continue
    }
    const meta = readBlockData(page.blocks, 'article-meta')
    const body = readBlockData(page.blocks, 'article-body')
    const paragraphs = Array.isArray(body?.blocks)
      ? body.blocks.map((item) => String(item?.text ?? '')).filter(Boolean)
      : []
    await prisma.newsArticle.create({
      data: {
        siteId: SITE_ID,
        title: page.title,
        summary: page.summary ?? '',
        content: paragraphs.join('\n'),
        publishDate: String(meta?.date ?? ''),
        slug,
        status: page.status,
        pageId: page.id
      }
    })
    created += 1
  }
  return { total: pages.length, created, skipped }
}

/** /faq/qNNN 详情页 → FaqItem */
async function backfillFaqs() {
  const pages = await prisma.page.findMany({
    where: { siteId: SITE_ID, path: { startsWith: '/faq/q' } },
    select: { id: true, title: true, status: true, path: true, blocks: true },
    orderBy: { id: 'asc' }
  })

  let created = 0
  let skipped = 0
  for (const page of pages) {
    if (!/^\/faq\/q\d+$/.test(String(page.path ?? ''))) continue
    const slug = String(page.path).slice('/faq/'.length)
    const exists = await prisma.faqItem.findFirst({ where: { siteId: SITE_ID, slug }, select: { id: true } })
    if (exists) {
      skipped += 1
      continue
    }
    const detail = readBlockData(page.blocks, 'faq-detail')
    const paragraphs = Array.isArray(detail?.paragraphs) ? detail.paragraphs.map((item) => String(item ?? '')) : []
    await prisma.faqItem.create({
      data: {
        siteId: SITE_ID,
        question: String(detail?.question ?? page.title),
        category: String(detail?.cat ?? ''),
        answer: paragraphs.filter(Boolean).join('\n'),
        slug,
        status: page.status,
        pageId: page.id
      }
    })
    created += 1
  }
  return { total: pages.length, created, skipped }
}

// ---------- 入口 ----------
try {
  console.log(`[回填] 目标站点 siteId=${SITE_ID}`)
  const articles = await backfillArticles()
  console.log(
    `[回填] NewsArticle：页面 ${articles.total} 条 → 新建 ${articles.created} 条 · 判重跳过 ${articles.skipped} 条`
  )
  const faqs = await backfillFaqs()
  console.log(`[回填] FaqItem：页面 ${faqs.total} 条 → 新建 ${faqs.created} 条 · 判重跳过 ${faqs.skipped} 条`)

  const articleCount = await prisma.newsArticle.count({ where: { siteId: SITE_ID } })
  const faqCount = await prisma.faqItem.count({ where: { siteId: SITE_ID } })
  console.log(`[回填] 表内现有：NewsArticle ${articleCount} 条（预期 7）· FaqItem ${faqCount} 条（预期 102）`)
  if (articleCount !== 7 || faqCount !== 102) {
    console.warn('[回填] ⚠ 与预期数量不一致，请核对 /news/* 与 /faq/q* 页面范围后再执行')
  }
} finally {
  await prisma.$disconnect()
}
