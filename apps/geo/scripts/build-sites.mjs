/**
 * 站点 SSG 构建脚本（增量发布入口）
 *
 * 用法：
 *   node scripts/build-sites.mjs --site <slug> [--pages <id1>,<id2>] [--rebuild]
 *   --site     目标站点标识（对应 sites.slug）
 *   --pages    可选，仅重建指定页面 ID（字符串，逗号分隔）；缺省 = 全站已发布页面
 *   --rebuild  可选，强制忽略构建缓存，重新执行 Vite 全量构建
 *
 * 流程（详见 docs/spec/09-site-editor.md §8 与 ADR-028）：
 *   1 取全量已发布路由与本次 targets
 *   2 块代码落盘（数据库 → .vue）+ 输出内容指纹报告
 *   3 构建缓存判定（块指纹 + 应用指纹 + apiBase）：
 *      - 代码有变 → `nuxt build`（只产出可运行 SSR 渲染服务 + _nuxt 资源，
 *                   不产出页面 HTML——资源目录的 prerender 已在 nuxt.config 关闭），
 *                   并把 .output 归档到 geo 根 .<slug>.build/ 缓存（位置约束见该常量注释）
 *      - 代码未变 → 跳过 Vite（发布开销的大头），直接复用缓存渲染服务
 *      随后统一「SSR 爬取」：拉起渲染服务，逐个请求 targets 把 HTML+payload
 *      写入 .gen —— 渲染开销从整站冷构建降为 O(目标页)
 *      ⚠️ 爬取是页面 HTML 的唯一产出路径，因此每一步都带硬超时与真实就绪判定：
 *         任一环节异常都以非零码快速退出，绝不允许挂起（否则表现为构建假死）
 *   4 复制现有正式产物到 .tmp，用 .gen 覆盖 —— 未重建页面不丢失
 *   5 robots / sitemap / llms 由服务端统一生成（与 GEO 索引更新共用实现）
 *   6 合并写 _trillion.json（本次页面条目覆盖、其余保留）
 *   7 按「清单 ∖ 全量路由」差集清理已下线页面
 *   8 被覆盖页的上一版归档到 .history（保留最近一版）
 *   9 原子替换（rename），.old 保留上一版完整产物
 *
 * 为什么不再用 `nuxt generate`：generate = Vite 整站冷构建 + 预渲染。
 * 块代码在保存时已由服务端 worker 编译校验，发布时再把全部块连同整站资源
 * 从零重编是纯浪费——内容编辑（不改代码）占发布动作的绝大多数。任何页面
 * 渲染失败（HTTP 非 200）本脚本以非零码退出，合并/替换不发生——失败不落线上。
 *
 * ⚠️ 修正记录（ADR-028）：旧实现为「建 .tmp → 只渲染选中路由 → 整站改名覆盖」，
 *    会丢掉站点其他页面、并使 sitemap/llms 缩水为只含变更页。
 *    根因是 nuxt generate 会先清空其 publicDir——改为「先生成到独立目录，
 *    再把生成结果合并进现有产物副本」。
 *
 * 目录布局（均在 apps/geo/sites/ 下；隐藏目录为中间态，sites/ 整体不入库）：
 *   <slug>/                  正式产物（可直接托管）
 *   .<slug>.gen/             本次渲染输出（targets + _nuxt 资源）
 *   .<slug>.tmp/             合并工作目录，成功后改名为正式目录
 *   .<slug>.old/             上一次完整产物（回退数据源）
 *   .<slug>.history/<pid>/   单页上一版归档：<pageId>/<相对文件路径>
 * 另：geo 根下 .<slug>.build/ = 构建缓存（meta.json + 归档渲染服务，必须在 geo 根且内容直放根层）
 */
import { spawn, spawnSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const siteSlug = arg('site')
const pages = arg('pages')
const forceRebuild = process.argv.includes('--rebuild')

if (!siteSlug) {
  console.error('缺少参数：--site <slug>')
  process.exit(1)
}

/**
 * API 基址：由根 env/ 派生后注入（pnpm build:sites 走根执行器；服务端发布管线亦显式注入）
 * 不内置默认地址，缺失直接失败，避免构建产物指向错误端口
 */
const apiBase = process.env.NUXT_PUBLIC_API_BASE
if (!apiBase) {
  console.error('[build] 缺少 NUXT_PUBLIC_API_BASE：请使用 pnpm build:sites 执行（变量由根 env/ 与 config/ 派生）')
  process.exit(1)
}

const root = process.cwd()
const outputRoot = path.resolve(root, 'sites')
const genDir = path.join(outputRoot, `.${siteSlug}.gen`)
const tmpDir = path.join(outputRoot, `.${siteSlug}.tmp`)
const oldDir = path.join(outputRoot, `.${siteSlug}.old`)
const historyDir = path.join(outputRoot, `.${siteSlug}.history`)
const finalDir = path.join(outputRoot, siteSlug)
/**
 * 站点级构建缓存（**本身即是归档的 .output**：server/、chunks/ 等直接在该目录下）。
 * ⚠️ 两个位置约束都由 Nitro 的 publicDir 相对化机制决定，缺一不可：
 *   1. 必须在 geo 根下（不能放 sites/ 里）；
 *   2. 归档内容必须直接放 cacheDir 根下（不能套一层 output/）。
 * 构建期 Nitro 把绝对 publicDir（apps/geo/sites/.<slug>.gen）相对化为 `../sites/<gen>`
 * （基准 = 构建输出目录 .output）；运行时以「server/index.mjs 所在目录」为基准解析同一
 * 相对路径。因此基准的父目录必须等于 apps/geo，才能拼回真实的 sites/.<slug>.gen。
 * 放错层级会让渲染服务静态文件全部 500、SSR 爬取全灭（2026-10-07 实测踩坑）。
 */
const cacheDir = path.resolve(root, `.${siteSlug}.build`)
const syncReportFile = path.join(outputRoot, `.${siteSlug}.sync-report.json`)

// ---------------- 通用工具 ----------------

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

/**
 * 递归复制目录（目标已存在则覆盖同名文件、保留其他文件）
 *
 * ⚠️ 不用 `fs.cpSync({ recursive: true })`：在 Windows + Node 22 下复制 nuxt generate 的产物树
 * 会让进程直接以 0xC0000409（STATUS_STACK_BUFFER_OVERRUN）崩掉，退出码 -1073740791，
 * 且没有任何可捕获的异常——构建会静默失败在中途。手写遍历在同样的目录上稳定通过。
 */
function copyDir(from, to) {
  if (!fs.existsSync(from)) return
  const stat = fs.statSync(from)
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      copyDir(path.join(from, entry.name), path.join(to, entry.name))
    }
    return
  }
  fs.copyFileSync(from, to)
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 取服务端数据（带重试）：构建紧接渲染请求之后，服务端刚被连续打过一轮，
 * 偶发连接重置会让整次构建白跑——网络层错误重试两次。
 */
async function fetchJson(url, retries = 2) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`请求失败 ${url} -> ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        console.warn(`[build] 请求 ${url} 失败（${error.message}），重试 ${attempt + 1}/${retries}`)
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  throw lastError
}

/** 路由路径 → 产物相对文件路径（/a/b → a/b/index.html） */
function fileOfPath(routePath) {
  if (routePath === '/' || routePath === '') return 'index.html'
  return `${routePath.replace(/^\/+|\/+$/g, '')}/index.html`
}

/** 产物文件指纹（sha1 前 16 位）：产物清单的 fileHash，读不到文件时给空串 */
function fileHashOf(absPath) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(absPath)).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

/** 北京时间字符串（YYYY-MM-DD HH:mm:ss），与站点产物清单口径一致 */
function beijingNow(date = new Date()) {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

/**
 * 站点级文档（robots.txt / sitemap.xml / llms.txt）拉取落盘。
 * 生成口径统一在服务端（site-documents.ts）——构建脚本与「GEO 索引更新」共用同一实现，
 * 避免两份生成逻辑漂移（09 §8.4）。
 */
async function writeSiteDocs(key, dir) {
  const documents = (await fetchJson(`${apiBase}/public/documents/${key}`)).data
  if (!documents) throw new Error('服务端未返回站点文档')
  fs.writeFileSync(path.join(dir, 'robots.txt'), documents.robots || '')
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), documents.sitemap || '')
  fs.writeFileSync(path.join(dir, 'llms.txt'), documents.llms || '')
}

/** 归档轮转：每个被覆盖页只保留最近一版；会话目录最多保留 20 个 */
function cleanupOldHistory(baseDir, keep = 20) {
  let sessions
  try {
    sessions = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return
  }
  while (sessions.length > keep) {
    const oldest = sessions.shift()
    if (oldest) rmrf(path.join(baseDir, oldest))
  }
}

/** 构建号：北京时间紧凑串 + 随机后缀（如 20261006-173512-9f3c） */
function makeBuildId() {
  const compact = beijingNow().replace(/[-:]/g, '').replace(' ', '-')
  return `${compact}-${crypto.randomBytes(2).toString('hex')}`
}

/** 删除某页产物文件，并向上清理空目录（不越过站点根） */
function removeArtifact(baseDir, relFile) {
  const abs = path.join(baseDir, relFile)
  rmrf(abs)
  let dir = path.dirname(abs)
  while (dir.startsWith(baseDir) && dir !== baseDir) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
      else break
    } catch {
      break
    }
    dir = path.dirname(dir)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------- 构建互斥锁 ----------------

/**
 * geo 根级构建锁：跨站点并发构建会互相污染共享目录——
 *   - sync-blocks 写同一份 app/components/blocks/Blk*.vue（后写的覆盖先写的）
 *   - nuxt build 共享根 .nuxt/ 与 .output/（构建中途被另一站点覆盖 → 缓存投毒）
 * 锁范围 = sync-blocks → nuxt build → 归档站点缓存；之后的 SSR 爬取与
 * 产物合并只操作站点私有目录（.<slug>.*），可并行，不持锁。
 *
 * 等锁而非失败：发布任务按站点串行（publish.service scheduleNext），
 * 跨站点同时发布是常态，等 30 分钟仍拿不到锁才视为异常。
 * 陈旧锁兜底：持锁进程已死（pid 不存在）或超过 45 分钟（> 构建超时 15 分钟 × 3）
 * 视为遗留锁，直接抢占——崩溃不会让后续发布永久卡死。
 */
const lockFile = path.join(outputRoot, '.build.lock')
const LOCK_WAIT_MS = 30 * 60 * 1000
const LOCK_STALE_MS = 45 * 60 * 1000

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function lockIsStale() {
  try {
    const stat = fs.statSync(lockFile)
    const info = readJson(lockFile)
    if (info?.pid && !pidAlive(info.pid)) return true
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS
  } catch {
    return false
  }
}

/** 获取构建锁，返回释放函数（同时挂进程退出钩子兜底清理） */
async function acquireBuildLock() {
  const deadline = Date.now() + LOCK_WAIT_MS
  let waitingLogged = false
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx')
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, site: siteSlug, startedAt: beijingNow() }))
      fs.closeSync(fd)
      const release = () => {
        try {
          // 只释放自己的锁：若已被他人判定陈旧抢占，勿删新持有者的锁
          if (readJson(lockFile)?.pid === process.pid) fs.unlinkSync(lockFile)
        } catch {
          /* 已被清理 */
        }
      }
      /** 任意退出路径（含 process.exit / 异常）都不遗留锁；信号退出由陈旧锁判定兜底 */
      process.on('exit', release)
      return release
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (lockIsStale()) {
        console.warn('[build] 检测到陈旧构建锁（持有者已退出或超时），接管')
        try {
          fs.unlinkSync(lockFile)
        } catch {
          /* 竞态，下轮重试 */
        }
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`等待其他站点构建锁超时（${LOCK_WAIT_MS / 60000} 分钟）：${lockFile}`, { cause: error })
      }
      if (!waitingLogged) {
        waitingLogged = true
        console.log('[build] 其他站点正在构建，等待构建锁…')
      }
      await sleep(2000)
    }
  }
}

// ---------------- 构建缓存与 SSR 爬取 ----------------

/**
 * 应用代码指纹：参与 Vite 构建的「非块」源文件内容摘要。
 * 不含 app/components/blocks/Blk*.vue（生成文件，变化已由块指纹覆盖）与 sites/。
 * 仓库根 lockfile 一并纳入——依赖版本变化同样要求重建。
 */
function computeAppFingerprint() {
  const hash = crypto.createHash('sha1')
  const entries = [
    'nuxt.config.ts',
    'package.json',
    'tsconfig.json',
    'app',
    'server',
    'scripts',
    'config',
    'types',
    'public',
    path.resolve(root, '..', '..', 'pnpm-lock.yaml')
  ]
  const visit = (abs) => {
    if (!fs.existsSync(abs)) return
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        visit(path.join(abs, entry.name))
      }
      return
    }
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (/^app\/components\/blocks\/Blk.*\.vue$/.test(rel)) return
    hash.update(rel)
    hash.update('\0')
    try {
      hash.update(fs.readFileSync(abs))
    } catch {
      hash.update('unreadable')
    }
    hash.update('\0')
  }
  entries.forEach(visit)
  return hash.digest('hex')
}

/** 从 SSR HTML 提取 payload 预载链接（<link rel="preload" as="fetch" href>） */
function extractPayloadHref(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || []
  for (const tag of tags) {
    if (!/\bas=["']?fetch["']?/i.test(tag)) continue
    const href = tag.match(/\bhref=["']([^"']+)["']/i)
    if (href) return href[1]
  }
  return null
}

/** 路由的 payload 文件路径（/ → /_payload.json；/about → /about/_payload.json） */
function defaultPayloadPath(routePath) {
  const base = routePath === '/' ? '' : routePath.replace(/\/+$/g, '')
  return `${base}/_payload.json`
}

/**
 * 向本地渲染服务发起一次请求。
 * Host 头显式设为站点 slug——useSiteKey 在「非回环 Host」分支下得到
 * key=slug、前缀为空，与构建期（import.meta.prerender 分支）语义一致；
 * 裸 127.0.0.1 会掉进「本地回环」分支，路径被当成站点前缀并触发重定向。
 * 用 node:http 而非 fetch：fetch 可能拒绝自定义 Host 头。
 */
function requestPage(port, urlPath, hostHeader, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method: 'GET',
        headers: { host: hostHeader, accept: 'text/html,application/xhtml+xml,*/*' }
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }))
      }
    )
    /**
     * 硬超时必须有：渲染服务在异常路径下可能既不写响应也不关闭连接
     * （实测：静态资产表 readFile ENOENT 时 500 响应不结束），
     * 无超时会让爬取永久挂起、构建进程假死。
     */
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)))
    req.on('error', reject)
    req.end()
  })
}

/**
 * 按 targets 爬取渲染服务，产出 HTML + payload 到 genDir。
 *
 * - 页面非 200 或缺少 #__nuxt → 记为失败，最终整次构建退出非零（不合并、不替换，线上原样）
 * - payload：优先跟随 HTML 的 preload 链接；无链接时探测标准路径（404 忽略）
 * - 404.html / 200.html 外壳：仅整站重建或外壳缺失时生成（catch-all 空态页充当，引用当前资源）
 */
async function crawlRender({ serverEntry, slug, targets, needShells }) {
  const logs = []
  let child = null
  let port = 0

  const startServer = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = 22_000 + Math.floor(Math.random() * 20_000)
      const proc = spawn(process.execPath, [serverEntry], {
        cwd: root,
        env: {
          ...process.env,
          PORT: String(candidate),
          HOST: '127.0.0.1',
          NODE_ENV: 'production',
          NUXT_PUBLIC_API_BASE: apiBase,
          NUXT_PUBLIC_SITE_SLUG: slug
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      proc.stdout.on('data', (chunk) => logs.push(String(chunk)))
      proc.stderr.on('data', (chunk) => logs.push(String(chunk)))
      let exited = false
      proc.on('exit', () => {
        exited = true
      })

      /**
       * 就绪判定必须看到「真实渲染成功的首页」，不能只看端口能响应：
       * 异常路径下服务可能返回 500/404（甚至响应不结束），任其通过会让后面的爬取
       * 在每一页上各等一次超时，最终表现为构建长时间无反馈。
       * 探测上限 30s（SSR 首页需拉站点数据，比纯静态服务慢，但远快于此）。
       */
      for (let tick = 0; tick < 30; tick += 1) {
        await sleep(1000)
        if (exited) break
        try {
          const probe = await requestPage(candidate, '/', slug, 5_000)
          if (probe.status === 200 && probe.body.includes('id="__nuxt"')) {
            child = proc
            port = candidate
            return true
          }
        } catch {
          /* 未就绪，继续轮询 */
        }
      }
      proc.kill('SIGKILL')
    }
    return false
  }

  if (!(await startServer())) {
    throw new Error(`渲染服务启动失败（3 次尝试）：${serverEntry}\n${logs.join('')}`)
  }

  try {
    const failures = []
    for (const route of targets) {
      const rel = fileOfPath(route.path)
      /** 进度日志前置：卡在某一页时能立刻从日志定位，而不是全页跑完才输出 */
      console.log(`[build]   渲染 ${rel}`)
      try {
        const page = await requestPage(port, route.path, slug)
        if (page.status !== 200 || !page.body.includes('id="__nuxt"')) {
          failures.push(`${route.path} -> HTTP ${page.status}`)
          continue
        }
        const html = page.body.toString('utf8')
        const outFile = path.join(genDir, rel)
        fs.mkdirSync(path.dirname(outFile), { recursive: true })
        fs.writeFileSync(outFile, html)

        /** payload：HTML 显式预载则必须拿到，否则客户端导航会读到旧数据 */
        const preload = extractPayloadHref(html)
        const href = preload || defaultPayloadPath(route.path)
        const payloadPath = href.split('?')[0]
        const payload = await requestPage(port, payloadPath, slug)
        if (payload.status === 200) {
          const payloadFile = path.join(genDir, payloadPath.replace(/^\/+/, ''))
          fs.mkdirSync(path.dirname(payloadFile), { recursive: true })
          fs.writeFileSync(payloadFile, payload.body)
        } else if (preload) {
          failures.push(`${payloadPath} -> HTTP ${payload.status}（payload 预载缺失）`)
        }
      } catch (error) {
        failures.push(`${route.path} -> ${error.message}`)
      }
    }

    if (needShells) {
      try {
        const probe = await requestPage(port, '/__trillion_404_probe__', slug)
        if (probe.body.includes('id="__nuxt"')) {
          fs.writeFileSync(path.join(genDir, '404.html'), probe.body)
          fs.writeFileSync(path.join(genDir, '200.html'), probe.body)
        } else {
          console.warn('[build]   警告：404 外壳探测结果异常，保留现有 404/200 外壳')
        }
      } catch (error) {
        console.warn(`[build]   警告：404 外壳生成失败（${error.message}），保留现有外壳`)
      }
    }

    if (failures.length) {
      /** 附渲染服务日志尾部：页面 SSR 抛错时，真正的堆栈只在这里可见 */
      const tail = logs.join('').trim().split('\n').slice(-25).join('\n')
      throw new Error(
        `以下页面渲染失败：\n  ${failures.join('\n  ')}${tail ? `\n--- 渲染服务日志（尾部）---\n${tail}` : ''}`
      )
    }
  } finally {
    child.kill()
    const force = setTimeout(() => child.kill('SIGKILL'), 5000)
    force.unref?.()
  }
}

fs.mkdirSync(outputRoot, { recursive: true })

// ---------------- 1) 站点校验 + 取全量路由与本次目标 ----------------

const site = (await fetchJson(`${apiBase}/public/site/${siteSlug}`)).data
if (!site) throw new Error('站点不存在或已停用')

const allRoutes = (await fetchJson(`${apiBase}/public/routes/${siteSlug}`)).data || []
if (!allRoutes.length) throw new Error('没有可构建的已发布页面，请先发布页面')

console.log(`[build] 站点 ${siteSlug}（${site.renderMode}）已发布页面 ${allRoutes.length} 个`)

if (site.renderMode !== 'ssg') {
  console.log('[build] 该站点非 SSG 模式，无需静态构建，内容即时生效')
  process.exit(0)
}

const targetIds = pages
  ? pages
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  : []
const targets = targetIds.length ? allRoutes.filter((item) => targetIds.includes(item.id)) : allRoutes
if (!targets.length) throw new Error(`没有匹配的待构建页面（--pages ${pages || '(全量)'}）`)

console.log(`[build] 本次重建 ${targets.length} 页：${targets.map((item) => item.path).join(', ')}`)

/**
 * 子进程环境：构建脚本与渲染服务共用。
 * NUXT_BUILD_OUTPUT 决定客户端资源（_nuxt）落到本次输出目录；
 * 页面 HTML 不由构建产出（nuxt.config 已关闭构建期 prerender），只走后面的 SSR 爬取。
 */
const env = {
  ...process.env,
  NUXT_PUBLIC_SITE_SLUG: siteSlug,
  NUXT_BUILD_OUTPUT: genDir,
  NUXT_PUBLIC_API_BASE: apiBase
}

// ---------------- 2) 块代码落盘 + 内容指纹报告 ----------------

/**
 * 先拿构建锁再动共享目录：sync-blocks 写 Blk*.vue、nuxt build 读写 .nuxt/.output，
 * 都是跨站点共享的——并发执行会互相覆盖。锁在渲染服务归档进站点缓存后释放。
 */
const releaseBuildLock = await acquireBuildLock()

/**
 * 块代码存在数据库，构建/渲染需要它落成 .vue 文件（幂等：未变化的块不重写）。
 * --report 输出 JSON：blockHash = 全部块代码的组合指纹，供下一步缓存判定。
 */
rmrf(syncReportFile)
const syncResult = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'sync-blocks.mjs'), '--site', siteSlug, '--report', syncReportFile],
  { cwd: root, env, stdio: 'inherit' }
)
if (syncResult.status !== 0) {
  console.error(`[build] 块同步失败（退出码 ${syncResult.status}）`)
  process.exit(syncResult.status || 1)
}
const syncReport = readJson(syncReportFile)
rmrf(syncReportFile)
if (!syncReport || !syncReport.blockHash) {
  console.error('[build] 块同步未产出指纹报告，无法判定构建缓存')
  process.exit(1)
}
rmrf(genDir)
rmrf(tmpDir)
fs.mkdirSync(genDir, { recursive: true })

// ---------------- 3) 构建缓存判定 + 渲染 ----------------

function resolveNuxtBin() {
  // 调用方式是 spawnSync(process.execPath, [nuxtBin, 'build'])，node 只能直接执行 .mjs
  const candidates = [
    path.join(root, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs'),
    path.join(root, '..', '..', 'node_modules', 'nuxt', 'bin', 'nuxt.mjs'),
    path.join(root, 'node_modules', '.bin', 'nuxt'),
    path.join(root, '..', '..', 'node_modules', '.bin', 'nuxt')
  ]
  return candidates.find((item) => fs.existsSync(item))
}

const appHash = computeAppFingerprint()
const cacheMetaFile = path.join(cacheDir, 'meta.json')
const serverEntry = path.join(cacheDir, 'server', 'index.mjs')
const cacheMeta = readJson(cacheMetaFile)
const cacheValid =
  !forceRebuild &&
  !!cacheMeta &&
  cacheMeta.blockHash === syncReport.blockHash &&
  cacheMeta.appHash === appHash &&
  cacheMeta.apiBase === apiBase &&
  fs.existsSync(serverEntry)

let needBuild = !cacheValid
if (needBuild) {
  const reason = forceRebuild
    ? '--rebuild 强制重建'
    : !cacheMeta
      ? '无构建缓存'
      : cacheMeta.blockHash !== syncReport.blockHash
        ? '块代码已变更'
        : cacheMeta.appHash !== appHash
          ? '应用代码已变更'
          : cacheMeta.apiBase !== apiBase
            ? 'API 地址已变更'
            : '缓存渲染服务缺失'
  console.log(`[build] ${reason}，执行 Vite 全量构建（nuxt build）`)

  const nuxtBin = resolveNuxtBin()
  if (!nuxtBin) {
    console.error('[build] 未找到 nuxt 可执行文件，请先执行 pnpm install')
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [nuxtBin, 'build'], { cwd: root, env, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`[build] nuxt build 失败（退出码 ${result.status}）`)
    process.exit(result.status || 1)
  }

  /**
   * 客户端资源应由 NUXT_BUILD_OUTPUT 落到 genDir；若构建产物在
   * .output/public（Nuxt 版本差异），兜底搬一次。
   */
  const fallbackPublic = path.join(root, '.output', 'public')
  if (!fs.existsSync(path.join(genDir, '_nuxt')) && fs.existsSync(path.join(fallbackPublic, '_nuxt'))) {
    console.warn('[build] 警告：_nuxt 资源未落到 NUXT_BUILD_OUTPUT，从 .output/public 补齐')
    copyDir(fallbackPublic, genDir)
  }

  if (!fs.existsSync(path.join(genDir, '_nuxt'))) {
    console.error('[build] 构建后未找到 _nuxt 资源，公开目录重定向失效')
    process.exit(1)
  }

  /**
   * 立即按站点归档渲染服务（.output 是多站点共享的，晚一步会被下一站点的构建覆盖）。
   * 归档内容直接放 cacheDir 根下——cacheDir 自身扮演 .output（publicDir 相对基准）。
   */
  rmrf(cacheDir)
  copyDir(path.join(root, '.output'), cacheDir)
  fs.writeFileSync(
    cacheMetaFile,
    JSON.stringify(
      { schema: 1, blockHash: syncReport.blockHash, appHash, apiBase, siteSlug, builtAt: beijingNow() },
      null,
      2
    )
  )
  console.log(`[build] 构建缓存已更新：${path.relative(root, cacheDir)}`)
} else {
  console.log('[build] 命中构建缓存（块与应用代码未变），跳过 Vite 编译')
}

/** 共享目录操作（sync / nuxt build / 缓存归档）到此结束，后续只碰站点私有目录 */
releaseBuildLock()

const needShells =
  needBuild || !fs.existsSync(path.join(finalDir, '404.html')) || !fs.existsSync(path.join(finalDir, '200.html'))

await crawlRender({ serverEntry, slug: siteSlug, targets, needShells })

// ---------------- 4) 基于现有产物构建合并工作目录 ----------------

/**
 * 为什么先复制再覆盖：`nuxt generate`（以及本次的爬取流程）只负责产出本次变更的页面，
 * 站点的其余页面必须从现有正式产物继承，否则页面级发布会丢掉其它页面。
 * （ADR-028 修正：旧实现在这里直接拿生成目录整体改名，把未重建的页面全部丢掉。）
 */
if (fs.existsSync(finalDir)) {
  console.log('[build] 复制现有产物到临时目录（合并未变更页面）')
  copyDir(finalDir, tmpDir)
} else {
  fs.mkdirSync(tmpDir, { recursive: true })
}

// ---------------- 5) 叠加本次生成的所有路由 ----------------

console.log('[build] 叠加本次生成的路由')
copyDir(genDir, tmpDir)

// ---------------- 6) 站点 robots / sitemap / llms（统一实现） ----------------

console.log('[build] 生成站点 robots / sitemap / llms')
await writeSiteDocs(siteSlug, tmpDir)

// ---------------- 7) 合并站点产物清单 _trillion.json ----------------

const buildId = makeBuildId()

/**
 * 产物清单契约：packages/shared/src/types/editor.ts 的 ArtifactManifest / ArtifactPageEntry。
 * 后台 ArtifactsService 按 pages[].pageId 派生徽标、按 generatedAt 显示「当前线上版本时间」、
 * 按 pages[].blocks[].codeHash 判定「块变更牵连」，回退流程也按 pages[].pageId 取上一版指纹——
 * 字段名与结构不可漂移（09 §8.2）。
 */
const toPageEntry = (route) => {
  const file = fileOfPath(route.path)
  return {
    pageId: route.id,
    path: route.path,
    file,
    contentHash: route.contentHash || '',
    fileHash: fileHashOf(path.join(tmpDir, file)),
    publishedAt: route.publishedAt ?? '',
    blocks: (route.blocks || []).map((item) => ({
      id: item.id,
      key: item.key,
      codeHash: item.codeHash || ''
    }))
  }
}

const existingManifest = readJson(path.join(finalDir, '_trillion.json'))
/**
 * 本次重建的页面覆盖旧条目，未重建页面沿用旧条目；
 * 只接纳契约格式（pageId 为字符串），历史遗留的错误格式条目在此自然淘汰。
 */
const mergedPages = new Map()
for (const page of existingManifest?.pages || []) {
  if (typeof page?.pageId === 'string' && page.pageId) mergedPages.set(page.pageId, page)
}
for (const route of targets) {
  mergedPages.set(route.id, toPageEntry(route))
}
const manifest = {
  buildId,
  siteId: site.id,
  slug: site.slug,
  domain: site.domain,
  generatedAt: beijingNow(),
  /** 全量已发布路由（string[]）：后台统计与「GEO 索引更新」都按此口径 */
  routes: allRoutes.map((item) => item.path),
  pages: [...mergedPages.values()]
}
fs.writeFileSync(path.join(tmpDir, '_trillion.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  `[build] 产物清单已合并：本次写入 ${targets.length} 页，合并后共 ${manifest.pages.length} 页（manifest ${buildId}）`
)

// ---------------- 8) 清理已下线页面 ----------------

const publishedSet = new Set(allRoutes.map((item) => item.path))
let removedCount = 0
for (const page of existingManifest?.pages || []) {
  if (!publishedSet.has(page.path)) {
    removeArtifact(tmpDir, fileOfPath(page.path))
    removedCount += 1
  }
}
if (removedCount > 0) {
  console.log(`[build] 已清理 ${removedCount} 个已下线页面的产物`)
}

// ---------------- 9) 归档上一版 + 原子替换 + 清理 ----------------

fs.mkdirSync(historyDir, { recursive: true })
const sessionDir = path.join(historyDir, `${Date.now()}-${buildId}`)
let archivedCount = 0
for (const page of targets) {
  const rel = fileOfPath(page.path)
  const prev = path.join(finalDir, rel)
  if (!fs.existsSync(prev)) continue
  const dest = path.join(sessionDir, String(page.id), rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(prev, dest)
  archivedCount += 1
}
if (archivedCount > 0) {
  console.log(`[build] 已归档 ${archivedCount} 个被覆盖页面的上一版（供单页回退）`)
  cleanupOldHistory(historyDir)
}

let backup = null
if (fs.existsSync(finalDir)) {
  rmrf(oldDir)
  fs.renameSync(finalDir, oldDir)
  backup = oldDir
}
fs.renameSync(tmpDir, finalDir)
if (backup) {
  rmrf(backup)
}

rmrf(genDir)

console.log(`[build] 完成：${siteSlug} 共 ${targets.length} 页 → ${path.relative(root, finalDir)}`)
console.log('[build] 详细路由与归档信息见 _trillion.json，回退数据保留于 .old 与 .history')
