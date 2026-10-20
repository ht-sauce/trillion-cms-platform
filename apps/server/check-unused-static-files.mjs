/**
 * 素材清理工具：找出 static_files 表中「未被任何内容引用」的孤立素材并可选清理。
 *
 * 引用判定（全量扫描，宁勿漏）：
 *   1. 数据库引用点：Site（logoFileId/faviconFileId/businessLicenseFileId + 全部 JSON 字段）、
 *      Page（blocks/draft/jsonLd/SEO 字段）、BlockDefinition(code/declaration)、
 *      BlockDefinitionVersion(code)、Channel、NavigationItem(href)、Entity、Template、PublishTask
 *   2. 构建产物引用点：apps/geo/sites/** 全部产物文件（已发布 HTML 里内联的 /static/... 仍有效）
 *
 * 用法：
 *   node check-unused-static-files.mjs            # 只扫描，输出孤立素材清单
 *   node check-unused-static-files.mjs --delete   # 扫描后删除孤立素材（库记录 + 物理文件）
 */
import { PrismaClient } from '@prisma/client'
import { loadConfig } from '../../config/index.mjs'
import * as fs from 'node:fs'
import * as path from 'node:path'

const config = loadConfig({ argv: process.argv.slice(2) })
process.env.DATABASE_URL = config.database.url
const prisma = new PrismaClient()

const DELETE = process.argv.includes('--delete')
/** GEO 站点产物目录（构建产物里可能内联 /static/... 引用） */
const GEO_SITES_DIR = path.join(config.root, 'apps', 'geo', 'sites')
/** 物理上传目录（server 进程 CWD = apps/server） */
const UPLOADS_DIR = path.join(config.root, 'apps', 'server', 'uploads')

/** 递归收集目录下所有文件绝对路径 */
function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** 读取文件内容（二进制容错：读不动就返回空串） */
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

console.log('== 素材引用扫描 ==\n')

// ---------- 1. 汇总数据库引用文本 ----------
const [sites, pages, blocks, blockVersions, channels, navItems, entities, templates, publishTasks, files] =
  await Promise.all([
    prisma.site.findMany(),
    prisma.page.findMany({
      select: { blocks: true, draft: true, jsonLd: true, seoTitle: true, seoDescription: true, seoKeywords: true }
    }),
    prisma.blockDefinition.findMany({ select: { code: true, declaration: true } }),
    prisma.blockDefinitionVersion.findMany({ select: { code: true } }),
    prisma.channel.findMany(),
    prisma.navigationItem.findMany(),
    prisma.entity.findMany(),
    prisma.template.findMany(),
    prisma.publishTask.findMany(),
    prisma.staticFile.findMany({ orderBy: { id: 'asc' } })
  ])

/** 站点级文件 ID 引用（logo / favicon / 营业执照） */
const fileIdRefs = new Set()
for (const site of sites) {
  for (const key of ['logoFileId', 'faviconFileId', 'businessLicenseFileId']) {
    if (site[key]) fileIdRefs.add(site[key])
  }
}

/** 数据库引用大文本：其余引用点整体序列化后做子串匹配 */
const dbBlob = JSON.stringify({
  sites,
  pages,
  blocks,
  blockVersions,
  channels,
  navItems,
  entities,
  templates,
  publishTasks
})

// ---------- 2. 构建产物引用文本 ----------
let fsBlob = ''
const geoFiles = walk(GEO_SITES_DIR)
for (const file of geoFiles) fsBlob += readText(file)
console.log(`数据库引用点：站点 ${sites.length} / 页面 ${pages.length} / 块定义 ${blocks.length} 等`)
console.log(`构建产物：${geoFiles.length} 个文件（${GEO_SITES_DIR}）\n`)

// ---------- 3. 判定孤立素材 ----------
const unused = files.filter(
  (file) => !fileIdRefs.has(file.id) && !dbBlob.includes(file.publicUrl) && !fsBlob.includes(file.publicUrl)
)
const usedCount = files.length - unused.length
const fmtSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

console.log(`素材总数 ${files.length}，被引用 ${usedCount}，孤立未引用 ${unused.length}`)
if (unused.length) {
  const reclaim = unused.reduce((sum, file) => sum + file.sizeBytes, 0)
  console.log(`可释放体积：${fmtSize(reclaim)}\n`)
  console.log('孤立素材清单：')
  for (const file of unused) {
    console.log(
      `  #${file.id}  [site ${file.siteId ?? '-'}]  ${file.originalName}  ${file.publicUrl}  ${fmtSize(file.sizeBytes)}`
    )
  }
}

// ---------- 4. 物理目录孤儿（磁盘有文件但库无记录，仅提示） ----------
const dbStoragePaths = new Set(files.map((file) => file.storagePath.replace(/\\/g, '/')))
const diskFiles = walk(UPLOADS_DIR)
const diskOrphans = diskFiles.filter((file) => {
  const relative = path.relative(UPLOADS_DIR, file).replace(/\\/g, '/')
  return !dbStoragePaths.has(`uploads/${relative}`)
})
if (diskOrphans.length) {
  console.log(`\n另有 ${diskOrphans.length} 个磁盘文件不在库中（uploads/ 目录孤儿，仅提示不处理）：`)
  for (const file of diskOrphans.slice(0, 20)) console.log(`  ${path.relative(UPLOADS_DIR, file)}`)
  if (diskOrphans.length > 20) console.log(`  ... 其余 ${diskOrphans.length - 20} 个略`)
}

// ---------- 5. 可选删除 ----------
if (!DELETE) {
  console.log('\n（只读扫描完成；确认清单无误后加 --delete 执行删除）')
  await prisma.$disconnect()
  process.exit(0)
}

if (!unused.length) {
  console.log('\n无孤立素材，无需删除')
  await prisma.$disconnect()
  process.exit(0)
}

console.log(`\n开始删除 ${unused.length} 个孤立素材（库记录 + 物理文件）...`)
let deleted = 0
for (const file of unused) {
  const abs = path.join(config.root, 'apps', 'server', file.storagePath)
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch (error) {
    console.warn(`  #${file.id} 物理文件删除失败（继续删库记录）：${error.message}`)
  }
  await prisma.staticFile.delete({ where: { id: file.id } })
  deleted += 1
}
console.log(`已删除 ${deleted} 条孤立素材`)
await prisma.$disconnect()
