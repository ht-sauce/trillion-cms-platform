/**
 * 建站描述分片合并器
 *
 * 为什么分片：建站描述里的页面块数据量很大，拆成多份并行产出、再由本脚本合成一份，
 * 既避免单文件冲突，也让「目录 / 页面」去重有唯一收口。
 *
 * 用法：node scripts/merge-site-data.mjs [--out scripts/data/site.json]
 *   输入：`scripts/data/site-profile.json`（站点档案 + 导航）+ `scripts/data/pages-*.json`（目录与页面分片）
 *   输出：一份可直接 POST /sites/bootstrap 的建站描述 JSON
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'scripts', 'data')

const outArg = process.argv.indexOf('--out')
const outPath = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : 'scripts/data/site.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const profile = readJson(path.join(dataDir, 'site-profile.json'))

/** 分片文件按名字排序，保证合并顺序稳定（重复项取先出现者） */
const shardFiles = fs
  .readdirSync(dataDir)
  .filter((file) => /^pages-.*\.json$/.test(file))
  .sort()

if (!shardFiles.length) {
  console.error('[merge] 未找到任何 scripts/data/pages-*.json 分片')
  process.exit(1)
}

const channels = []
const channelSeen = new Set()
const pages = []
const pageSeen = new Set()
const problems = []

for (const file of shardFiles) {
  const shard = readJson(path.join(dataDir, file))
  for (const channel of shard.channels ?? []) {
    if (!channel?.slug) {
      problems.push(`${file}: 目录缺少 slug`)
      continue
    }
    if (channelSeen.has(channel.slug)) continue
    channelSeen.add(channel.slug)
    channels.push(channel)
  }
  for (const page of shard.pages ?? []) {
    if (!page?.slug || !page?.channelSlug) {
      problems.push(`${file}: 页面缺少 channelSlug/slug`)
      continue
    }
    const identity = `${page.channelSlug}/${page.slug}`
    if (pageSeen.has(identity)) {
      problems.push(`${file}: 页面重复 ${identity}（已跳过）`)
      continue
    }
    pageSeen.add(identity)
    pages.push(page)
  }
}

/** 页面引用的目录必须存在，否则导入器会直接抛错 */
const channelSlugs = new Set(channels.map((item) => item.slug))
for (const page of pages) {
  if (!channelSlugs.has(page.channelSlug)) {
    problems.push(`页面 ${page.channelSlug}/${page.slug} 引用了不存在的目录 ${page.channelSlug}`)
  }
  if (!channelSlugs.has(page.channelSlug)) continue
}

/** 导航引用的页面必须存在（支持 /path、channel/slug、唯一裸 slug 三种写法） */
const pagePaths = new Set()
const pageComposites = new Set(pageSeen)
const slugCount = new Map()
for (const page of pages) {
  const channelPath = `/${page.channelSlug}`
  const resolved = page.slug === 'home' ? '/' : page.slug === 'index' ? channelPath : `${channelPath}/${page.slug}`
  pagePaths.add(resolved)
  slugCount.set(page.slug, (slugCount.get(page.slug) ?? 0) + 1)
}
for (const nav of profile.navigations ?? []) {
  for (const item of nav.items ?? []) {
    const ref = item.pageSlug
    if (!ref) continue
    const hit = ref.startsWith('/')
      ? pagePaths.has(ref)
      : ref.includes('/')
        ? pageComposites.has(ref)
        : slugCount.get(ref) === 1
    if (!hit) problems.push(`导航 ${nav.key} 的「${item.label}」指向不存在的页面：${ref}`)
  }
}

const output = {
  slug: profile.slug,
  name: profile.name,
  domain: profile.domain,
  profile: profile.profile ?? {},
  channels,
  pages,
  navigations: profile.navigations ?? []
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

console.log(
  `[merge] 分片 ${shardFiles.join(', ')} → ${path.relative(root, outPath)}：目录 ${channels.length} · 页面 ${pages.length} · 导航 ${(profile.navigations ?? []).length} 组`
)
if (problems.length) {
  console.error(`[merge] 发现 ${problems.length} 个问题：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(2)
}
console.log('[merge] 校验通过：目录引用、导航引用均可解析')
