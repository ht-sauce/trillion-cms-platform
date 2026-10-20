/**
 * 块代码落盘：把服务端保存的块定义写成 `app/components/blocks/Blk<PascalKey>.vue`
 *
 * 为什么需要这一步（09 §4.3）：
 *   块代码存在数据库里（唯一事实来源），但 Nuxt/Vite 只能编译磁盘上的 .vue 文件。
 *   因此在「构建前」与「本地开发前」把块代码同步落盘一次，让渲染引擎能像普通组件一样编译它们。
 *
 * 幂等与清理：
 *   按服务端返回的清单整体覆盖，**删除清单里没有的旧文件**——
 *   否则「块被删了但文件还在」会让页面渲染出一个已经不存在的块。
 *
 * 用法：node scripts/sync-blocks.mjs [--site <slug>] [--report <file>]
 *   缺省站点取自 NUXT_PUBLIC_SITE_SLUG
 *   --report 追加输出一份 JSON 指纹报告（blockHash = 全部块代码的组合指纹），
 *            供 build-sites.mjs 判定构建缓存是否命中（能否跳过 Vite 编译）
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本文件位于 <root>/scripts/ 下，上溯一级即应用根目录 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const blocksDir = path.join(root, 'app', 'components', 'blocks')

/** 站点标识：优先命令行，其次环境变量（构建脚本与启动器都会注入） */
const siteSlug = process.argv.includes('--site')
  ? process.argv[process.argv.indexOf('--site') + 1]
  : process.env.NUXT_PUBLIC_SITE_SLUG

const apiBase = process.env.NUXT_PUBLIC_API_BASE
const internalToken = process.env.INTERNAL_API_TOKEN || ''

if (!siteSlug) {
  console.error('[blocks] 缺少站点标识：请用 --site <slug> 或设置 NUXT_PUBLIC_SITE_SLUG')
  process.exit(1)
}
if (!apiBase) {
  console.error('[blocks] 缺少 NUXT_PUBLIC_API_BASE：请通过 pnpm 执行器运行（变量由根 env/ 与 config/ 派生）')
  process.exit(1)
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`请求失败 ${url} -> ${response.status}`)
  const payload = await response.json()
  /** 服务端有全局响应拦截器，业务数据在 `data` 里（裸响应只在少数内部接口出现，两种都兼容） */
  return payload && typeof payload === 'object' && 'data' in payload && payload.code !== undefined
    ? payload.data
    : payload
}

const manifest = await fetchJson(`${apiBase}/internal/blocks?site=${encodeURIComponent(siteSlug)}`, {
  'x-internal-token': internalToken
})
if (!manifest || !Array.isArray(manifest.items)) {
  console.error('[blocks] 服务端返回的块清单格式异常')
  process.exit(1)
}

fs.mkdirSync(blocksDir, { recursive: true })

/** 本次应存在的文件名集合 */
const expected = new Set(manifest.items.map((item) => item.fileName))

/** 清理清单外的旧块文件（只清理 Blk 前缀，避免误删手写组件） */
for (const file of fs.readdirSync(blocksDir)) {
  if (!file.startsWith('Blk') || !file.endsWith('.vue')) continue
  if (!expected.has(file)) {
    fs.rmSync(path.join(blocksDir, file), { force: true })
    console.log(`[blocks] 移除已删除的块：${file}`)
  }
}

/** 文件指纹：内容未变则跳过写入，避免 Vite 无谓地触发热更新与重编译 */
function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)
}

let written = 0
let skipped = 0
for (const item of manifest.items) {
  const target = path.join(blocksDir, item.fileName)
  const next = item.code
  /**
   * 头部注释：标明这是生成产物，避免有人直接编辑后被下次同步覆盖
   * （块代码的唯一编辑入口是后台块库，见 09 §4.2）
   */
  const content = next.includes('<!-- generated -->')
    ? next
    : `<!-- generated -->\n<!--\n  本文件由服务端块定义生成，请勿直接编辑。\n  修改请到管理后台「块库」编辑 ${item.key}，再重新同步。\n  块：${item.name}（${item.key}）\n-->\n${next}`

  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (existing && sha1(existing) === sha1(content)) {
    skipped += 1
    continue
  }
  fs.writeFileSync(target, content, 'utf8')
  written += 1
}

console.log(
  `[blocks] 站点 ${siteSlug}：清单 ${manifest.items.length} 个块（写入 ${written} · 未变 ${skipped}）→ ${path.relative(root, blocksDir)}`
)

/** 指纹报告（--report）：全部块代码的组合摘要，按 key 排序保证稳定 */
const reportIndex = process.argv.indexOf('--report')
if (reportIndex >= 0 && process.argv[reportIndex + 1]) {
  const reportFile = process.argv[reportIndex + 1]
  const blockHash = crypto
    .createHash('sha1')
    .update(
      manifest.items
        .map((item) => `${item.key}:${item.code}`)
        .sort()
        .join('\n')
    )
    .digest('hex')
  fs.mkdirSync(path.dirname(reportFile), { recursive: true })
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        schema: 1,
        site: siteSlug,
        count: manifest.items.length,
        written,
        skipped,
        blockHash
      },
      null,
      2
    )
  )
}
