/**
 * 站点图片迁移脚本：把页面 blocks 里的 /assets/img/** 引用迁移到服务端素材库（static_files）。
 *
 * 背景：站点图片从 apps/geo/public/assets/img/ 静态目录迁移到服务端素材库
 * （StaticFile 表 + uploads/<yyyy>/<mm>/<uuid>.<ext>，URL 形如 /static/yyyy/mm/uuid.ext，
 * 上传规则与 static-files.service.ts 对齐）。本脚本幂等可重复执行，失败重跑安全。
 *
 * 处理规则：
 *   1. 递归扫描站点全部 Page.blocks 字符串，收集 /assets/img/** 引用（可能嵌在更长字符串里，按子串替换）；
 *   2. 源文件存在 → 复制进 uploads/<yyyy>/<mm>/<uuid>.<ext> 并建 StaticFile 记录；
 *   3. 源文件不存在且为 env-NN.<ext> → 用真实环境图（hall.jpg，退而 building.jpg）作占位内容
 *      走同样入库流程，originalName 保留 env-NN.<ext> 便于后续在素材库识别替换；
 *   4. 其余缺失/白名单外引用不处理，仅告警；
 *   5. 幂等：引用已是 /static/** 的页面自然跳过（扫描不到）；同站点同 originalName 且源内容
 *      hash 相同（内存 Map + 查 static_files 物理文件 hash 比对）时不重复建记录。
 *
 * 用法：
 *   node apps/server/scripts/sync-site-images.mjs --dry-run    # 演练：只打印将做的操作，不写库不拷文件
 *   node apps/server/scripts/sync-site-images.mjs              # 真实执行
 *   可选 --site <id> 覆盖目标站点（默认 3）
 *
 * 说明：数据库连接走根 config/ 体系（env/.env.<环境> 派生，与 check-unused-static-files.mjs 同口径），
 * 进程已显式设置 DATABASE_URL 时以其为准；不触发发布/构建，全站重发由发布流程统一完成。
 */
import { PrismaClient } from '@prisma/client'
import { loadConfig } from '../../../config/index.mjs'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------- 参数与环境 ----------
const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const siteArgIndex = argv.indexOf('--site')
const SITE_ID = (siteArgIndex >= 0 && argv[siteArgIndex + 1]) || '3'

const config = loadConfig({ argv })
process.env.DATABASE_URL = process.env.DATABASE_URL || config.database.url
const prisma = new PrismaClient()

/** GEO 站点静态资产根目录（引用源） */
const GEO_PUBLIC_DIR = path.join(config.root, 'apps', 'geo', 'public')
/** 服务端运行根目录（uploads 相对它，与服务端进程 CWD 一致） */
const SERVER_ROOT = path.join(config.root, 'apps', 'server')
const UPLOAD_DIR = config.vars.UPLOAD_DIR || 'uploads'
const PUBLIC_PREFIX = String(config.vars.PUBLIC_URL_PREFIX || '/static').replace(/\/+$/, '')

/** 占位图候选（依次取第一个真实存在的文件；内容与被占位的 env-NN 同为 jpg，MIME 不冲突） */
const PLACEHOLDER_CANDIDATES = ['env/hall.jpg', 'env/building.jpg']

/** 扩展名 → MIME（与 static-files.service.ts 的 ALLOWED_MIME 白名单对齐，不在表内即跳过） */
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
}

/** 引用匹配正则 */
const REF_PATTERN = /\/assets\/img\/[\w\-./]+/g

// ---------- 工具函数 ----------
/** sha256（hex） */
function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * 在任意 JSON 值里按映射替换引用子串
 * @param {unknown} value blocks 里的任意值
 * @param {Map<string, string>} refMap 引用 → /static/** url
 * @returns {{ value: unknown, count: number }} 新值（无替换时保持原引用）与替换发生次数
 */
function processValue(value, refMap) {
  if (typeof value === 'string') return replaceRefs(value, refMap)
  if (Array.isArray(value)) {
    let count = 0
    let changed = false
    const next = value.map((item) => {
      const result = processValue(item, refMap)
      count += result.count
      if (result.value !== item) changed = true
      return result.value
    })
    return { value: changed ? next : value, count }
  }
  if (value && typeof value === 'object') {
    let count = 0
    let changed = false
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      const result = processValue(item, refMap)
      count += result.count
      if (result.value !== item) changed = true
      next[key] = result.value
    }
    return { value: changed ? next : value, count }
  }
  return { value, count: 0 }
}

/**
 * 替换单个字符串里的引用子串
 * 正则可能把句号等标点吞进匹配尾部（[\w\-./] 含 '.'），查找按去尾点后的引用，
 * 替换时保留被吞的尾部字符，避免破坏正文标点。
 */
function replaceRefs(text, refMap) {
  let count = 0
  let value = text
  if (refMap.size) {
    value = text.replace(REF_PATTERN, (match) => {
      const ref = match.replace(/\.+$/, '')
      const target = refMap.get(ref)
      if (!target) return match
      count += 1
      return target + match.slice(ref.length)
    })
  }
  return { value: count ? value : text, count }
}

/** 递归收集值中全部引用（同一引用多处出现时去重） */
function collectRefs(value, out) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(REF_PATTERN)) out.add(match[0].replace(/\.+$/, ''))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectRefs(item, out)
  }
}

/** 统计某引用作为子串在值中出现的总次数 */
function countOccurrences(value, ref) {
  if (typeof value === 'string') return value.split(ref).length - 1
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countOccurrences(item, ref), 0)
  if (value && typeof value === 'object')
    return Object.values(value).reduce((sum, item) => sum + countOccurrences(item, ref), 0)
  return 0
}

/** 占位图内容（懒加载）：返回 { bytes, source } 或 null */
function loadPlaceholder() {
  loadPlaceholder.cache ||= (() => {
    for (const candidate of PLACEHOLDER_CANDIDATES) {
      const abs = path.join(GEO_PUBLIC_DIR, 'assets', 'img', candidate)
      if (fs.existsSync(abs)) return { bytes: fs.readFileSync(abs), source: candidate }
    }
    return null
  })()
  return loadPlaceholder.cache
}

/**
 * 为单个引用生成迁移计划：源文件读取 / 占位 / 判重（内存 + 库内物理文件 hash 比对）。
 * 返回字段：skip（原因）或 reusedId + publicUrl（复用）或 isNew 计划（originalName/content/storagePath/abs/publicUrl）。
 */
async function buildPlan(ref) {
  // Nuxt public 目录即站点根：URL /assets/img/x.jpg 对应 public/assets/img/x.jpg，只去首斜杠
  const relative = ref.replace(/^\//, '')
  const sourceAbs = path.join(GEO_PUBLIC_DIR, relative)
  const basename = path.posix.basename(ref)
  const ext = path.extname(basename).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) return { ref, skip: `扩展名 ${ext || '(无)'} 不在白名单` }

  let content = null
  let mode = 'copy'
  if (fs.existsSync(sourceAbs)) {
    content = fs.readFileSync(sourceAbs)
  } else if (/^env-\d+\.\w+$/i.test(basename)) {
    const placeholder = loadPlaceholder()
    if (!placeholder) return { ref, skip: '源文件不存在且占位图候选均缺失' }
    content = placeholder.bytes
    mode = 'placeholder'
  } else {
    return { ref, skip: '源文件不存在' }
  }

  const hash = sha256(content)
  /** 同站点同 originalName 且物理文件 hash 相同 → 复用既有记录（跨执行幂等的关键） */
  const candidates = await prisma.staticFile.findMany({
    where: { siteId: SITE_ID, originalName: basename },
    select: { id: true, storagePath: true, publicUrl: true },
    orderBy: { id: 'asc' }
  })
  for (const candidate of candidates) {
    const abs = path.join(SERVER_ROOT, candidate.storagePath)
    if (fs.existsSync(abs) && sha256(fs.readFileSync(abs)) === hash) {
      return { ref, mode, reusedId: candidate.id, publicUrl: candidate.publicUrl }
    }
  }

  // 新建：目录与命名规则对齐 static-files.service.ts（uploads/<yyyy>/<mm>/<uuid>.<ext>）
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const name = `${randomUUID()}${ext}`
  const storagePath = `${UPLOAD_DIR}/${yyyy}/${mm}/${name}`
  return {
    ref,
    mode,
    isNew: true,
    originalName: basename,
    content,
    mimeType: mime,
    sizeBytes: content.length,
    storagePath,
    abs: path.join(SERVER_ROOT, storagePath),
    publicUrl: `${PUBLIC_PREFIX}/${yyyy}/${mm}/${name}`
  }
}

// ---------- 主流程 ----------
console.log('== 站点图片迁移 → 素材库 ==')
console.log(`站点 ${SITE_ID}${DRY_RUN ? '（演练模式：不写库、不拷文件）' : ''}`)
if (!SITE_ID) {
  console.error('站点 ID 非法，请用 --site <id> 指定')
  process.exit(1)
}

try {
  const site = await prisma.site.findUnique({ where: { id: SITE_ID } })
  if (!site) {
    console.error(`站点 ${SITE_ID} 不存在，终止`)
    process.exit(1)
  }

  const pages = await prisma.page.findMany({
    where: { siteId: SITE_ID },
    select: { id: true, title: true, blocks: true },
    orderBy: { id: 'asc' }
  })
  console.log(`页面总数 ${pages.length}\n`)

  // ---------- 1. 扫描各页引用，构建引用 → url 映射（不落库） ----------
  /** @type {Map<string, number>} 引用 → 出现次数 */
  const refCounts = new Map()
  /** @type {Map<string, object>} 引用 → 迁移计划 */
  const refPlans = new Map()
  /** @type {Map<string, { title: string, refMap: Map<string, string> }>} */
  const pagePlans = new Map()

  for (const page of pages) {
    const refs = new Set()
    collectRefs(page.blocks, refs)
    if (!refs.size) continue

    const refMap = new Map()
    for (const ref of refs) {
      refCounts.set(ref, (refCounts.get(ref) || 0) + countOccurrences(page.blocks, ref))
      let plan = refPlans.get(ref)
      if (!plan) {
        plan = await buildPlan(ref)
        refPlans.set(ref, plan)
      }
      if (plan.publicUrl) refMap.set(ref, plan.publicUrl)
    }
    if (refMap.size) pagePlans.set(page.id, { title: page.title, refMap })
  }

  const plans = [...refPlans.values()]
  const skipped = plans.filter((plan) => plan.skip)
  const reused = plans.filter((plan) => plan.reusedId)
  const fresh = plans.filter((plan) => plan.isNew)
  const placeholders = plans.filter((plan) => plan.mode === 'placeholder')
  let refOccurrences = 0
  for (const count of refCounts.values()) refOccurrences += count

  // ---------- 2. 打印计划（演练模式到此为止） ----------
  console.log(
    `引用：${refOccurrences} 处 / 去重 ${plans.length} 个（源缺失占位 ${placeholders.length}，复用记录 ${reused.length}，待入库 ${fresh.length}，跳过 ${skipped.length}）`
  )
  for (const plan of plans) {
    const label = plan.skip
      ? `跳过（${plan.skip}）`
      : plan.reusedId
        ? `复用 #${plan.reusedId}`
        : plan.mode === 'placeholder'
          ? '占位入库'
          : '入库'
    console.log(`  ${label}  ${plan.ref}${plan.publicUrl ? `  →  ${plan.publicUrl}` : ''}`)
  }
  if (skipped.length) console.log(`\n⚠ 跳过的引用保持原样，请人工确认：${skipped.map((plan) => plan.ref).join('、')}`)

  if (!plans.length) console.log('无 /assets/img 引用（已全部迁移或本就无引用）')

  if (DRY_RUN) {
    console.log('\n演练完成：未写库、未拷文件')
    await prisma.$disconnect()
    process.exit(0)
  }

  // ---------- 3. 真实执行：先拷文件，再单事务写库（失败重跑安全，极端情况仅产生无库记录的孤儿文件） ----------
  const placeholderSource = loadPlaceholder()?.source
  if (placeholderSource) console.log(`\n占位图来源：assets/img/${placeholderSource}`)

  for (const plan of fresh) {
    fs.mkdirSync(path.dirname(plan.abs), { recursive: true })
    fs.writeFileSync(plan.abs, plan.content)
  }

  let created = 0
  let updatedPages = 0
  await prisma.$transaction(async (tx) => {
    for (const plan of fresh) {
      await tx.staticFile.create({
        data: {
          siteId: SITE_ID,
          originalName: plan.originalName,
          storagePath: plan.storagePath,
          publicUrl: plan.publicUrl,
          mimeType: plan.mimeType,
          sizeBytes: plan.sizeBytes,
          width: null,
          height: null,
          uploadedBy: null
        }
      })
      created += 1
    }
    for (const [pageId, pagePlan] of pagePlans) {
      const page = pages.find((item) => item.id === pageId)
      const result = processValue(page.blocks, pagePlan.refMap)
      if (!result.count) continue
      await tx.page.update({ where: { id: pageId }, data: { blocks: result.value } })
      updatedPages += 1
    }
  })

  console.log(
    `\n执行完成：引用 ${refOccurrences} 处，入库 ${created} 条（占位 ${placeholders.filter((plan) => plan.isNew).length}），替换页面 ${updatedPages} 个`
  )
  console.log('注意：未触发发布/构建，全站产物请由发布流程统一重发；页面 contentHash 由后续发布流程重算')
} finally {
  await prisma.$disconnect()
}
