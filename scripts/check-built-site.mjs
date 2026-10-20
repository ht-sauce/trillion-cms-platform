#!/usr/bin/env node
/**
 * 站点产物机械检查（09 §12.3 step7 补充 / §12.4 验收清单）：
 *   1) 每页唯一 <h1>、<title>、meta description、canonical（title/canonical 全站不重复）
 *   2) 每页 JSON-LD（application/ld+json）可 parse
 *   3) 内链完整性：href="/..." 目标在产物内存在（<path>/index.html 或静态资产）
 *   4) 图片可达性：img src 目标文件存在
 *   5) NAP 口径：全站电话不得出现登记口径（029-82531111）以外的变体
 *   6) 标签闭合粗检：section/div/main/footer/header 计数平衡
 *
 * 本脚本只做机械校验，不能替代 §12.5 的人眼视觉比对。
 * 用法：node scripts/check-built-site.mjs <siteDir>   # 如 apps/geo/sites/xian-renai-skin
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const siteDir = process.argv[2]
if (!siteDir || !fs.existsSync(siteDir)) {
  console.error('用法：node scripts/check-built-site.mjs <siteDir>')
  process.exit(2)
}

// ---------- 收集页面 ----------
const pages = []
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.old' || name === '.history' || name === '_nuxt') continue
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (name === 'index.html') pages.push(full)
  }
}
walk(siteDir)
pages.sort()

const issues = [] // { check, page, msg }
const add = (check, page, msg) => issues.push({ check, page: path.relative(siteDir, page), msg })
const seenTitle = new Map()
const seenCanon = new Map()

// ---------- 逐页检查 ----------
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8')

  // 1) h1 / title / description / canonical
  const h1s = html.match(/<h1[\s>]/g) || []
  if (h1s.length !== 1) add('h1-unique', file, `h1 数量 ${h1s.length}（应为 1）`)
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  if (!title.trim()) add('title', file, 'title 为空')
  else if (seenTitle.has(title)) add('title-unique', file, `title 与 ${seenTitle.get(title)} 重复`)
  else seenTitle.set(title, path.relative(siteDir, file))
  if (!/name=["']description["']/i.test(html)) add('description', file, '缺 meta description')
  const canon =
    (html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/) || [])[1] ||
    (html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/) || [])[1]
  if (!canon) add('canonical', file, '缺 canonical')
  else if (seenCanon.has(canon)) add('canonical-unique', file, `canonical 与 ${seenCanon.get(canon)} 重复`)
  else seenCanon.set(canon, path.relative(siteDir, file))

  // 2) JSON-LD
  const ldBlocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []
  if (ldBlocks.length === 0) add('jsonld-present', file, '无 JSON-LD')
  for (const block of ldBlocks) {
    try {
      JSON.parse(block.replace(/<\/?script[^>]*>/g, ''))
    } catch (e) {
      add('jsonld-parse', file, e.message.slice(0, 80))
    }
  }

  // 3) 内链（href="/..."；锚点与外链跳过）
  const hrefs = html.match(/href="\/[^"]*"/g) || []
  for (const h of hrefs) {
    let target = h.slice(6, -1).split('#')[0].split('?')[0]
    if (!target || target === '/') target = '/index.html'
    else if (target.endsWith('/')) target += 'index.html'
    const fsPath = path.join(siteDir, target)
    if (!fs.existsSync(fsPath)) {
      // 容忍目录形式 /faq/q001 → faq/q001/index.html
      if (!fs.existsSync(path.join(siteDir, target, 'index.html'))) {
        add('link', file, `断链 ${h.slice(6, -1)}`)
      }
    }
  }

  // 4) 图片
  const imgs = html.match(/<img[^>]+src="\/[^"]+"/g) || []
  for (const tag of imgs) {
    const src = (tag.match(/src="([^"]+)"/) || [])[1].split('?')[0]
    if (!fs.existsSync(path.join(siteDir, src))) add('image', file, `缺图 ${src}`)
  }

  // 5) NAP 电话口径
  const phones = html.match(/029[-\s]?\d{3}[-\s]?\d{5}/g) || []
  for (const p of phones) {
    if (p !== '029-82531111') add('nap-phone', file, `电话变体 ${p}`)
  }

  // 6) 标签闭合粗检
  for (const tag of ['section', 'div', 'main', 'footer', 'header']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (open !== close) add('tags', file, `<${tag}> 开 ${open} / 闭 ${close}`)
  }
}

// ---------- 汇总 ----------
const byCheck = {}
for (const i of issues) (byCheck[i.check] ||= []).push(i)
console.log(`[check] 页面 ${pages.length} 个`)
const CHECKS = [
  'h1-unique',
  'title',
  'title-unique',
  'description',
  'canonical',
  'canonical-unique',
  'jsonld-present',
  'jsonld-parse',
  'link',
  'image',
  'nap-phone',
  'tags'
]
let failed = false
for (const c of CHECKS) {
  const list = byCheck[c] || []
  console.log(`  ${list.length === 0 ? '✓' : '✗'} ${c.padEnd(16)} ${list.length === 0 ? '通过' : list.length + ' 项'}`)
  for (const i of list.slice(0, 5)) console.log(`      - ${i.page}: ${i.msg}`)
  if (list.length > 5) console.log(`      … 另 ${list.length - 5} 条`)
  if (list.length) failed = true
}
process.exit(failed ? 1 : 0)
