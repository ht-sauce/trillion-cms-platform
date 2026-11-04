#!/usr/bin/env node
/**
 * 正文块数组 → 整篇 HTML 的一次性回填（ADR-060）
 *
 * 背景：ADR-053/054 时期正文以块数组存储（`NewsArticle.body` / `CaseStudy.bodyBlocks`）。
 * ADR-060 把正文主数据改为整篇 HTML（`bodyHtml`），历史数据需要一次性转换，
 * 否则详情页会继续走「块 → 模板」的旧路径（排版降级）。
 *
 * 转换口径（与 `apps/server/src/common/utils/article-html.ts#articleBlocksToHtml` 一致）：
 * 段落 / 小标题 → `<p>` / `<h2>`（保留块内的行内 html）；图片 → `<figure><img …>`（带 figcaption）；
 * 表格 → `<table>`；视频 → `<video controls>`；rich 块原样输出。
 *
 * 用法：
 *   node scripts/data/backfill-body-html.mjs            # 默认 dry-run（只打印计划）
 *   node scripts/data/backfill-body-html.mjs --apply    # 真正写库
 *   node scripts/data/backfill-body-html.mjs --apply --env test
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const envIndex = argv.indexOf('--env')
const APP_ENV = envIndex >= 0 ? argv[envIndex + 1] : 'development'

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

function escapeText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/** 历史块数组 → 整篇 HTML */
function blocksToHtml(input) {
  const list = Array.isArray(input) ? input : []
  return list
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      const kind = String(block.kind ?? 'paragraph')
      const align = block.align ? ` style="text-align:${block.align}"` : ''
      const inline = block.html || escapeText(String(block.text ?? ''))
      if (kind === 'image') {
        if (!block.src) return ''
        const alt = block.alt ? ` alt="${escapeAttr(block.alt)}"` : ''
        const caption = block.caption ? `<figcaption>${escapeText(block.caption)}</figcaption>` : ''
        return `<figure><img src="${escapeAttr(block.src)}"${alt}>${caption}</figure>`
      }
      if (kind === 'video') {
        if (!block.src) return ''
        const poster = block.poster ? ` poster="${escapeAttr(block.poster)}"` : ''
        const caption = block.caption ? `<figcaption>${escapeText(block.caption)}</figcaption>` : ''
        return `<figure><video src="${escapeAttr(block.src)}"${poster} controls></video>${caption}</figure>`
      }
      if (kind === 'table') {
        const rows = Array.isArray(block.rows) ? block.rows : []
        if (!rows.length) return ''
        const head = block.header === false ? [] : [rows[0]]
        const body = block.header === false ? rows : rows.slice(1)
        const headHtml = head.map((row) => `<tr>${row.map((cell) => `<th>${cell}</th>`).join('')}</tr>`).join('')
        const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
        return `<table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`
      }
      if (kind === 'rich') return inline || ''
      if (!inline.trim()) return ''
      if (kind === 'heading') return `<h2${align}>${inline}</h2>`
      return `<p${align}>${inline}</p>`
    })
    .filter(Boolean)
    .join('')
}

async function main() {
  const { databaseUrl, vars } = loadEnv(APP_ENV)
  process.env.DATABASE_URL = databaseUrl
  const require = createRequire(path.join(ROOT, 'apps/server/package.json'))
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

  console.log(`[回填] 环境 ${APP_ENV} · 库 ${vars.DB_NAME} · 模式 ${APPLY ? 'APPLY（写库）' : 'DRY-RUN（不写库）'}`)

  const articles = await prisma.newsArticle.findMany({
    where: { bodyHtml: null },
    select: { id: true, title: true, body: true, content: true }
  })
  const cases = await prisma.caseStudy.findMany({
    where: { bodyHtml: null },
    select: { id: true, title: true, bodyBlocks: true, body: true }
  })

  const newsPlan = articles
    .map((row) => ({
      id: row.id,
      title: row.title,
      html: blocksToHtml(row.body),
      source: Array.isArray(row.body) ? row.body.length : 0
    }))
    .filter((row) => row.html)
  const casePlan = cases
    .map((row) => ({
      id: row.id,
      title: row.title,
      html: blocksToHtml(row.bodyBlocks),
      source: Array.isArray(row.bodyBlocks) ? row.bodyBlocks.length : 0
    }))
    .filter((row) => row.html)

  console.log(`\n[回填] 新闻待转换 ${newsPlan.length} 条（body 为空 ${articles.length - newsPlan.length} 条跳过）`)
  for (const item of newsPlan) console.log(`  - ${item.title} | 块 ${item.source} → HTML ${item.html.length} 字符`)
  console.log(`\n[回填] 案例待转换 ${casePlan.length} 条（bodyBlocks 为空 ${cases.length - casePlan.length} 条跳过）`)
  for (const item of casePlan.slice(0, 8))
    console.log(`  - ${item.title} | 块 ${item.source} → HTML ${item.html.length} 字符`)
  if (casePlan.length > 8) console.log(`  … 其余 ${casePlan.length - 8} 条省略`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] 未写库。确认无误后加 --apply 执行。')
    await prisma.$disconnect()
    return
  }

  for (const item of newsPlan) {
    await prisma.newsArticle.update({ where: { id: item.id }, data: { bodyHtml: item.html } })
  }
  for (const item of casePlan) {
    await prisma.caseStudy.update({ where: { id: item.id }, data: { bodyHtml: item.html } })
  }
  console.log(`\n[回填] 完成：新闻 ${newsPlan.length} 条、案例 ${casePlan.length} 条`)
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(`\n[失败] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
