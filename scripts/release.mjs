#!/usr/bin/env node
/**
 * 上线器：一键把平台**代码**发布到测试 / 生产环境（不碰数据库）
 *
 * 三个脚本的分工：
 * - `scripts/dev.mjs`（开发启动器，`pnpm allDev` / `dev:*`）：源码直跑（`nest start --watch` / `nuxt dev`），改代码即时生效
 * - 本文件（上线器，`pnpm release:*`）：构建产物 + 生产模式常驻（`node dist/main`、`node .output/server/index.mjs`）
 * - `scripts/db-release.mjs`（数据库上线器，`pnpm db:deploy*`）：结构变更的**增量发布**，独立命令、独立执行时机
 *
 * **为什么数据库不并入本文件**：结构变更与代码发布是两件事——执行时机可能不同（先加字段再上代码，或先上代码再回填）、
 * 影响面不同（迁移不可回滚、可能锁表）、审计点不同（谁在何时改了哪个库）。因此本文件**绝不执行任何迁移**，
 * 只做**只读检查**：发现结构落后就拦下并提示先跑 `pnpm db:deploy --env <环境>`（确需先上代码再用 `--force` 放行）。
 *
 * 用法：
 *   pnpm release:test                                   # 测试环境上线代码（构建 → 生产模式启动）
 *   pnpm release:prod                                   # 生产环境上线代码
 *   pnpm release --env production --check               # 只体检（配置 + 数据库迁移状态），不构建不启动
 *   pnpm release --env production --build-only          # 体检 + 构建后停止，不启动进程（配合 PM2 使用）
 *   pnpm release --env production --skip-build server   # 只重启服务端（沿用上次构建产物）
 *   pnpm release --env production admin geo             # 只发布前端（不涉及数据库，跳过迁移检查）
 *
 * 选项：
 *   --check          只做体检（配置 + 数据库迁移状态），不做构建、不启动
 *   --build-only     体检 + 构建后停止，不启动进程（Linux 服务器配合 PM2 使用，与 --check / --skip-build 互斥）
 *   --skip-build     跳过构建（沿用上次产物，用于快速重启）
 *   --force          忽略体检中的阻断项（错误项）继续执行
 *   --help           打印本说明
 *
 * 流程（顺序即安全性：任一步失败立即中止，不会进入下一步）：
 *   1) 体检：环境文件 / 必填变量 / 生产密钥与地址占位值 / 目标端口 / 数据库迁移是否落后（只读）
 *   2) 构建：共享类型包 → 服务端 / 管理后台 / GEO 项目（各应用按清单顺序串行）
 *   3) 释放端口 → 以生产模式启动（各应用 `start:prod`，端口由 config/ports.mjs 注入）
 *   4) 就绪探测（HTTP）→ 健康检查（含运行时数据库连通）→ 打印入口清单并落盘仓库根 release-endpoints.txt
 *
 *   `--build-only` 在 2) 后停止：体检与构建照常、不释放端口不启动进程——服务器上的进程启停交给 PM2
 *   （`scripts/pm2-config.mjs` 生成 ecosystem.config.json，操作见 docs/spec/10-launch-runbook.md，决策见 ADR-041）
 *
 * 说明：
 * - 上线器在前台托管三个进程，Ctrl+C 一并结束；Linux 生产长期运行用 PM2 守护（见 docs/spec/10-launch-runbook.md）
 * - 完整上线（首次部署或含结构变更）是**两条命令**：`pnpm db:deploy:prod`（结构）→ `pnpm release:prod`（代码）
 */
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { COLOR_RESET } from '../config/apps.mjs'
import {
  APP_NAMES,
  REPO_ROOT,
  SHARED_PACKAGE,
  buildAppEnv,
  describeConfig,
  describeEndpoints,
  findApp,
  loadConfig
} from '../config/index.mjs'
import { freePort, IS_WIN } from './port-guard.mjs'
import { spawnPnpm } from './pnpm.mjs'

/** 日志前缀（与开发启动器的 [启动器] 区分，便于日志混排时辨认） */
const TAG = '上线器'

/** 数据库只读检查用的目标应用：连接串由服务端配置派生 */
const DB_APP = 'server'

/** 就绪探测参数：轮询间隔、单次请求超时、总超时 */
const PROBE_INTERVAL_MS = 1000
const PROBE_TIMEOUT_MS = 3000
const READY_TIMEOUT_MS = 120_000

/** 各应用的就绪探测路径（服务端给健康检查，前端给首页） */
const PROBE_PATH = { server: '/geoserver/health', admin: '/geocms/', geo: '/' }

/** 入口清单落盘文件（写在仓库根，不入库）：终端日志刷屏时的兜底查看入口 */
const ENDPOINTS_FILE = 'release-endpoints.txt'

/** 生产环境禁止出现的占位值 / 弱密钥特征（上线前必须替换） */
const PLACEHOLDER_PATTERN = /(please[-_]?change|change[-_]?me|your[-_]|example|placeholder|todo)/i

/** 回环地址：生产环境的 PUBLIC_HOST 填它意味着只有本机能访问 */
const LOOPBACK_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map()
let stopping = false
let exited = 0

/** 本次上线是否由 force 放行（体检错误项被忽略） */
let forced = false

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const usage = [
  '用法：node scripts/release.mjs --env <development|test|production> [目标应用...] [选项]',
  '',
  '  目标应用   server / admin / geo（缺省 = 全部）',
  '  --check          只体检（配置 + 数据库迁移状态），不构建不启动',
  '  --build-only     体检 + 构建后停止，不启动进程（Linux 服务器配合 PM2 使用）',
  '  --skip-build     跳过构建（沿用上次产物）',
  '  --force          忽略体检中的阻断项（如结构落后时仍要先上代码）',
  '',
  '本命令只发布代码，绝不改数据库；结构变更请另跑：pnpm db:deploy --env <环境>',
  '',
  '例：pnpm release:prod / pnpm release:test / pnpm release --env production --build-only'
].join('\n')

/** 解析命令行：`--env <name>` / `--env=<name>` / 布尔选项 / 其余非选项参数视为目标应用 */
function parseArgs(argv) {
  let appEnv
  const flags = new Set()
  const targets = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env') {
      appEnv = argv[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--env=')) {
      appEnv = arg.slice('--env='.length)
      continue
    }
    if (arg.startsWith('--')) {
      flags.add(arg.replace(/^--/, ''))
      continue
    }
    if (!arg.startsWith('-')) targets.push(arg)
  }
  return { appEnv, flags, targets }
}

/**
 * 执行一个包脚本并等待结束（构建 / 迁移步骤；日志直接继承到当前终端）
 * @param {string[]} pnpmArgs 传给 pnpm 的参数
 * @param {Record<string, string>} [env] 追加的环境变量（上线时按应用注入）
 * @returns {Promise<number>} 退出码
 */
function runInherit(pnpmArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(pnpmArgs, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/**
 * 执行一个包脚本并回收输出（用于需要判定结果的步骤，如迁移状态）
 * @param {string[]} pnpmArgs
 * @param {Record<string, string>} [env]
 * @returns {Promise<{ code: number, output: string }>}
 */
function runCapture(pnpmArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(pnpmArgs, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    const collect = (chunk) => {
      output += chunk.toString()
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code: code ?? 1, output }))
  })
}

/**
 * 执行一个上线步骤：打印标题、计时、失败即中止
 * @param {string} label 步骤名（打印用）
 * @param {string[]} pnpmArgs
 * @param {{ env?: Record<string, string>, tolerate?: boolean }} [options] tolerate 时非零退出不中止
 */
async function runStep(label, pnpmArgs, options = {}) {
  const started = Date.now()
  console.log(`\n[${TAG}] ▶ ${label} …`)
  const code = await runInherit(pnpmArgs, options.env)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (code === 0) {
    console.log(`[${TAG}] ✓ ${label} 完成（${seconds}s）`)
    return code
  }
  if (options.tolerate) {
    console.warn(`[${TAG}] ! ${label} 返回非零退出码 ${code}（按「需人工关注」继续）`)
    return code
  }
  console.error(`\n[${TAG}] ✗ ${label} 失败（退出码 ${code}），已中止上线（数据库与运行中的进程未被改动）`)
  process.exit(code)
}

/** 体检项：level 为 error 时阻断上线（除 --force），warn 仅提示 */
function check(level, label, detail) {
  return { level, label, detail }
}

/**
 * 环境体检：把「上线前必须确认」的项目逐条查出来
 *
 * 只做静态判定（不连数据库、不构建），数据库连通与迁移状态由 `inspectMigrations()` 负责，
 * 两者共同构成 `--check` 的输出。
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string[]} names 目标应用
 * @param {Set<string>} flags 命令行选项
 */
function inspect(config, names, flags) {
  const results = []
  const isProd = config.appEnv === 'production'
  const vars = config.vars
  const secret = String(vars.JWT_SECRET ?? '').trim()

  results.push(check('ok', '运行环境', `${config.appEnv}（${path.relative(config.root, config.envFile)}）`))
  results.push(
    check(
      'ok',
      '数据库',
      `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`
    )
  )
  results.push(check('ok', 'API 基址', config.urls.apiBase))
  results.push(check('ok', '发布应用', names.map((name) => `${name}:${config.ports[name]}`).join('  ')))

  /** 生产密钥：占位值或短于 32 位都视为未加固 */
  if (PLACEHOLDER_PATTERN.test(secret)) {
    results.push(check(isProd ? 'error' : 'warn', 'JWT_SECRET', '疑似占位值，上线前必须替换为 32 位以上随机串'))
  } else if (secret.length < 32) {
    results.push(check(isProd ? 'error' : 'warn', 'JWT_SECRET', `长度仅 ${secret.length} 位，建议 32 位以上随机串`))
  } else {
    results.push(check('ok', 'JWT_SECRET', `已配置（${secret.length} 位）`))
  }

  /** 生产地址：仍是回环地址时只有本机能访问，前端 API 基址与 CORS 白名单也只对本机有效 */
  if (isProd && LOOPBACK_PATTERN.test(config.urls.host)) {
    results.push(
      check('warn', 'PUBLIC_HOST', `${config.urls.host} 为回环地址，跨机部署请填域名或内网 IP（影响 API 基址与 CORS）`)
    )
  }

  /** 跨域白名单：生产建议显式声明，缺省派生值在反向代理后常与实际来源不一致 */
  if (isProd && !String(vars.CORS_ORIGINS ?? '').trim()) {
    results.push(check('warn', 'CORS_ORIGINS', '未显式配置，按端口派生；经 nginx 反代时请填写真实来源'))
  }

  /** 生产库口令为空（本地默认 root 无口令），非生产忽略 */
  if (isProd && !String(config.database.password ?? '').trim()) {
    results.push(check('warn', 'DB_PASSWORD', '数据库口令为空，生产环境请设置强口令'))
  }

  /** 跳过构建时必须已有产物，否则启动会直接失败 */
  if (flags.has('skip-build')) {
    const missing = names.filter((name) => !hasBuildOutput(name))
    if (missing.length) {
      results.push(
        check('error', '构建产物', `--skip-build 但缺少产物：${missing.map((name) => findApp(name).title).join('、')}`)
      )
    } else {
      results.push(check('ok', '构建产物', '已存在（--skip-build 沿用上次产物）'))
    }
  }

  return results
}

/** 判断某应用是否已有生产产物（服务端 dist/main.js；两个 Nuxt 应用 .output/server/index.mjs） */
function hasBuildOutput(name) {
  const app = findApp(name)
  const relative = name === 'server' ? path.join('dist', 'main.js') : path.join('.output', 'server', 'index.mjs')
  return fs.existsSync(path.join(REPO_ROOT, app.dir, relative))
}

/** 打印体检结果，返回阻断项数量 */
function printChecks(results) {
  /** 徽标宽度按最长项对齐，终端里更易横向扫读 */
  const marks = { ok: 'ok  ', warn: 'warn', error: 'fail' }
  console.log(`\n[${TAG}] 环境体检`)
  for (const item of results) console.log(`  [${marks[item.level]}] ${item.label}  ${item.detail}`)
  return results.filter((item) => item.level === 'error').length
}

/**
 * 数据库**只读**检查：结构是否跟上代码（本命令绝不执行迁移，只负责拦下）
 *
 * `prisma migrate status` 在「有未应用迁移」或「库不存在」时返回非零退出码，属正常情况，
 * 这里以输出内容判定结论，不把它当作命令失败。目标不含服务端时直接跳过——两个前端不依赖数据库连接。
 * @param {ReturnType<typeof loadConfig>} config
 * @param {boolean} withServer 本次是否发布服务端
 * @returns {Promise<Array<{ level: string, label: string, detail: string }>>}
 */
async function inspectDatabase(config, withServer) {
  const deployHint = `pnpm db:deploy --env ${config.appEnv}`
  if (!withServer) {
    return [check('ok', '数据库迁移', '本次未发布服务端，不做检查（结构变更一律由 pnpm db:deploy 独立发布）')]
  }

  const env = { ...process.env, ...buildAppEnv(config, DB_APP) }
  const { output } = await runCapture(['--filter', findApp(DB_APP).packageName, 'prisma:status'], env)
  /** Prisma 错误码与固定文案：P1001 不可达 / P1000 认证失败 / P1003 库不存在 */
  const unreachable =
    /P1001|P1000|Can't reach database server|Authentication failed|Environment variable not found/i.test(output)
  const missingDb = /P1003|does not exist/i.test(output)
  const pending = /have not yet been applied|Following migration/i.test(output)

  if (unreachable) {
    return [check('error', '数据库', '不可达或凭据无效：请确认 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME')]
  }
  if (missingDb) {
    return [
      check('error', '数据库', `库 ${config.database.name} 不存在，请先执行 ${deployHint}（会自动建库并应用全部迁移）`)
    ]
  }
  if (pending) {
    return [check('error', '数据库迁移', `结构落后于代码，请先执行 ${deployHint} 再上线代码（否则新代码跑在旧结构上）`)]
  }
  return [
    check('ok', '数据库迁移', `结构已是最新（${config.database.name}，只读检查；迁移由 pnpm db:deploy 独立发布）`)
  ]
}

/** HTTP 探测：任何响应（含 404）都算「进程已就绪」；0 表示无响应 */
async function httpProbe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'manual' })
    return response.status
  } catch {
    return 0
  }
}

/** 子进程输出按行加应用前缀（上线形态日志量小，不做开发启动器的清单补打） */
function pipeWithPrefix(stream, app) {
  if (!stream) return
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) process.stdout.write(`${app.color}[${app.name}]${COLOR_RESET} ${line}\n`)
  })
  stream.on('end', () => {
    if (buffer) process.stdout.write(`${app.color}[${app.name}]${COLOR_RESET} ${buffer}\n`)
  })
}

/** 以生产模式启动单个应用（跑 start:prod，端口由注入的 PORT 生效） */
function startApp(config, name) {
  const app = findApp(name)
  const child = spawnPnpm(['--filter', app.packageName, app.startScript], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...buildAppEnv(config, name) },
    stdio: ['ignore', 'pipe', 'pipe'],
    /** POSIX 下独立进程组，便于 Ctrl+C 时整组回收 */
    detached: !IS_WIN
  })

  pipeWithPrefix(child.stdout, app)
  pipeWithPrefix(child.stderr, app)

  child.on('error', (error) => {
    console.error(`${app.color}[${app.name}]${COLOR_RESET} 启动失败：${error.message}`)
  })
  child.on('exit', (code, signal) => {
    const reason = signal ? `信号 ${signal}` : `退出码 ${code}`
    console.log(`${app.color}[${app.name}]${COLOR_RESET} 已退出（${reason}）`)
    exited += 1
    if (stopping) return
    if (exited === children.size) {
      console.log(`[${TAG}] 全部进程已退出`)
      process.exit(code ?? 0)
    }
    console.warn(`[${TAG}] 警告：${app.title} 意外退出，请查看其日志（生产环境建议交给 systemd / Docker 托管）`)
  })

  children.set(name, child)
  return child
}

/**
 * 等待各应用就绪：请求到任何 HTTP 响应即视为就绪
 * （生产形态无编译，启动很快；geo 首页在无站点前缀时可能 404，那也说明进程与路由已工作）
 * @returns {Promise<{ ready: Record<string, number>, failed: string[] }>}
 */
async function waitForReady(config, names) {
  /** @type {Map<string, number>} 短名 → 启动时刻 */
  const pending = new Map(names.map((name) => [name, Date.now()]))
  const ready = {}
  const failed = []
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (pending.size && !stopping && Date.now() < deadline) {
    await delay(PROBE_INTERVAL_MS)
    for (const [name, startedAt] of [...pending]) {
      const app = findApp(name)
      const child = children.get(name)
      if (child && child.exitCode !== null) {
        pending.delete(name)
        failed.push(name)
        console.error(`[${TAG}] ${app.title} 启动失败：进程已退出（端口 ${config.ports[name]}）`)
        continue
      }

      const status = await httpProbe(`http://127.0.0.1:${config.ports[name]}${PROBE_PATH[name] || '/'}`)
      if (!status) continue
      pending.delete(name)
      ready[name] = status
      console.log(
        `[${TAG}] ${app.title} 已就绪：http://${config.urls.host}:${config.ports[name]}（HTTP ${status}，` +
          `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s）`
      )
    }
  }

  if (stopping) return { ready, failed }
  for (const name of pending.keys()) {
    failed.push(name)
    console.warn(
      `[${TAG}] 警告：${findApp(name).title} 在 ${READY_TIMEOUT_MS / 1000}s 内未响应（端口 ${config.ports[name]}）`
    )
  }
  return { ready, failed }
}

/** 服务端健康检查（含数据库连通）：返回简明结论，供上线收尾打印 */
async function checkHealth(config) {
  const url = `http://127.0.0.1:${config.ports.server}/geoserver/health`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    const body = await response.json().catch(() => null)
    const data = body?.data ?? {}
    if (response.ok && data.status === 'ok') return `HTTP ${response.status} · 数据库连通`
    return `HTTP ${response.status} · 数据库异常（${data.message ?? '未返回详情'}）`
  } catch (error) {
    return `不可用（${error instanceof Error ? error.message : String(error)}）`
  }
}

/** 入口清单：打印到终端并落盘仓库根（终端刷屏时可直接打开文件） */
function publishEndpoints(lines) {
  console.log(`\n${'─'.repeat(72)}`)
  for (const line of lines) console.log(line)
  console.log('─'.repeat(72))
  try {
    fs.writeFileSync(path.join(REPO_ROOT, ENDPOINTS_FILE), `${lines.join('\n')}\n`, 'utf8')
  } catch (error) {
    console.warn(`[${TAG}] 写入 ${ENDPOINTS_FILE} 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 结束全部子进程（含进程组），保证不留孤儿进程 */
function stopAll() {
  if (stopping) return
  stopping = true
  if (!children.size) {
    console.log(`\n[${TAG}] 收到中断信号，已中止`)
    process.exit(0)
  }
  console.log(`\n[${TAG}] 收到中断信号，正在结束全部进程…`)
  for (const child of children.values()) {
    if (!child.pid) continue
    try {
      /** Windows 用 taskkill /T 连派生的 node 子进程一起结束；POSIX 结束整个进程组 */
      if (IS_WIN) execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
      else process.kill(-child.pid, 'SIGTERM')
    } catch {
      /** 已退出 */
    }
  }
  setTimeout(() => process.exit(0), 1500)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)

/** 仅在被直接执行时运行（便于被测试脚本引用） */
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}

async function main() {
  const { appEnv, flags, targets } = parseArgs(process.argv.slice(2))
  if (flags.has('help')) {
    console.log(usage)
    return
  }

  /** 选项互斥：--build-only 要求本次完成体检 + 构建，--check / --skip-build 都与它矛盾 */
  if (flags.has('build-only')) {
    const conflict = flags.has('check') ? '--check' : flags.has('skip-build') ? '--skip-build' : null
    if (conflict) {
      console.error(`[${TAG}] --build-only 与 ${conflict} 互斥：前者要求本次完成体检 + 构建，请去掉其一`)
      process.exit(1)
    }
  }

  const config = loadConfig({ appEnv })
  const names = [...new Set((targets.length ? targets : APP_NAMES).map((name) => findApp(name).name))]
  const checkOnly = flags.has('check')
  forced = flags.has('force')
  const withServer = names.includes(DB_APP)

  /** 上线摘要：环境 + 本次动作，先让人看清「要对哪个环境做什么」再动手 */
  console.log('─'.repeat(72))
  console.log(`[${TAG}] 代码上线${checkOnly ? '（只体检）' : ''}`)
  for (const line of describeConfig(config, names)) console.log(`  ${line}`)
  if (!checkOnly) {
    const tail = flags.has('build-only') ? '停止（不启动进程，启停交给 PM2）' : '生产模式启动'
    console.log(
      '  本次动作  ' +
        [flags.has('skip-build') ? '跳过构建' : '构建全部产物', tail].join(' → ') +
        '（不含数据库；结构变更另执行 pnpm db:deploy）'
    )
  }
  console.log('─'.repeat(72))

  /** 1) 体检：静态项 + 数据库只读检查（结构落后会拦下，但本命令不改数据库） */
  const results = inspect(config, names, flags)
  if (withServer) console.log(`\n[${TAG}] 数据库迁移只读检查（${config.database.name}，不执行任何变更）…`)
  results.push(...(await inspectDatabase(config, withServer)))
  const errors = printChecks(results)
  if (errors && !forced) {
    console.error(`\n[${TAG}] 体检未通过（${errors} 项阻断），已中止；修正后重跑，或用 --force 强行继续`)
    process.exit(1)
  }
  if (errors) console.warn(`[${TAG}] 已用 --force 忽略 ${errors} 项阻断，请自行确认风险`)

  if (checkOnly) {
    console.log(`\n[${TAG}] 体检完成（本次不构建、不启动、不改数据库）`)
    return
  }

  /** 2) 构建：共享类型包在前，服务端与两个前端随后（前端类型依赖 shared） */
  if (!flags.has('skip-build')) {
    await runStep(`构建共享类型包（${SHARED_PACKAGE}）`, ['--filter', SHARED_PACKAGE, 'build'])
    for (const name of names) {
      const app = findApp(name)
      await runStep(`构建 ${app.title}（${app.dir}）`, ['--filter', app.packageName, app.buildScript], {
        env: buildAppEnv(config, name)
      })
    }
  } else {
    console.log(`\n[${TAG}] 跳过构建（沿用上次产物）`)
  }

  /** --build-only：体检 + 构建后即停止（进程启停交给 PM2，见 scripts/pm2-config.mjs 与 10 号手册） */
  if (flags.has('build-only')) {
    console.log(`\n${'─'.repeat(72)}`)
    console.log(`[${TAG}] 体检 + 构建完成（${config.appEnv}）；进程未启动，数据库未改动`)
    console.log(`[${TAG}] 后续交给 PM2 守护（docs/spec/10-launch-runbook.md）：`)
    console.log(`  node scripts/pm2-config.mjs --env ${config.appEnv}   # env 有变更时重新生成 PM2 配置`)
    console.log('  pm2 startOrReload ecosystem.config.json --update-env && pm2 save')
    console.log('─'.repeat(72))
    return
  }

  /** 3) 释放端口并启动（旧进程不清理会让新进程起不来或端口回退） */
  console.log('')
  for (const name of names) await freePort(config.ports[name], `${findApp(name).title}`, { tag: TAG })

  console.log('')
  for (const name of names) startApp(config, name)
  console.log(`[${TAG}] 已拉起 ${names.length} 个进程（生产模式），等待就绪…`)

  const { ready, failed } = await waitForReady(config, names)
  if (stopping) return

  /** 4) 健康检查 + 入口清单：服务端给出运行时数据库连通结论，清单同时落盘 */
  const health = ready.server ? await checkHealth(config) : '未就绪（见上方日志）'
  const lines = [
    `[${TAG}] 运行环境  ${config.appEnv}（${path.relative(config.root, config.envFile)}）`,
    `[${TAG}] 数据库    ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}（结构未改动）`,
    `[${TAG}] 健康检查  ${health}`,
    ...(failed.length
      ? [`[${TAG}] 未就绪    ${failed.map((name) => findApp(name).title).join('、')}（见其日志）`]
      : []),
    '',
    ...describeEndpoints(config, names, {}, { lan: false }),
    '',
    `[${TAG}] 入口地址已写入 ${ENDPOINTS_FILE}`,
    `[${TAG}] 代码上线完成（数据库未改动）；结构变更请另执行 pnpm db:deploy --env ${config.appEnv}`,
    `[${TAG}] 进程由本命令托管：按 Ctrl+C 结束全部（Linux 生产长期运行用 PM2 守护，见 docs/spec/10-launch-runbook.md）`
  ]
  publishEndpoints(lines)
}
