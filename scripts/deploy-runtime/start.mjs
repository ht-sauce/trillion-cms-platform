#!/usr/bin/env node
/**
 * 部署包进程入口：按 config/apps.mjs 清单拉起全部应用并守护（ADR-042）
 *
 * 本文件随 `pnpm pack:deploy` 进入部署包根目录，与包内 `config/`、`env/` 配合工作；
 * 服务器上无需 git / pnpm / PM2，只要有 Node 20+：
 *
 *   node start.mjs              # 前台运行全部应用（Ctrl+C 一并结束；SSH 断开即退出）
 *   node start.mjs daemon       # 后台守护运行（SSH 断开不影响；日志落 logs/，pid 落 .run/）
 *   node start.mjs stop         # 结束后台守护（含全部子进程）
 *   node start.mjs status       # 查看守护进程与各应用端口健康
 *   node start.mjs restart      # 重启后台守护（stop → daemon；前台模式请 Ctrl+C 后重跑）
 *   node start.mjs daemon server admin   # 只启动指定应用（可选，缺省全部）
 *
 * 设计要点：
 * - 进程清单来自 `config/apps.mjs` 的 APPS（当前三端：服务端 / 管理后台 / GEO 项目），
 *   每端 spawn `node <script>`（cwd 对齐各应用包目录，相对路径 uploads、sites 等据此解析）
 * - 端口 / 连接串 / API 基址 / 密钥由 `config/index.mjs` 的 buildAppEnv() 派生后注入子进程，
 *   唯一事实来源仍是包内 `env/.env.<环境>` + `config/`（环境名缺省读打包时写入的 `.deploy-env`）
 * - 崩溃自动重启：间隔 4s、连续上限 10 次（稳定运行 60s 后计数清零），超限放弃并告警
 * - script 路径与 `scripts/pm2-config.mjs` 的 SCRIPT_PATH 同口径（服务端 dist/main.js，Nuxt 应用 .output）
 */
import { execSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAMES, COLOR_RESET, findApp } from './config/apps.mjs'
import { buildAppEnv, describeConfig, describeEndpoints, loadConfig } from './config/index.mjs'

/** 日志前缀（与仓库侧启动器 / 上线器风格一致） */
const TAG = '启动器'

/** 部署包根目录（本文件位于包根） */
const ROOT = fileURLToPath(new URL('.', import.meta.url))

/** 本文件绝对路径（daemon 拉起 worker 时复用） */
const SELF_FILE = fileURLToPath(import.meta.url)

/** pid 与日志目录（包根下，运行时生成） */
const RUN_DIR = path.join(ROOT, '.run')
const LOG_DIR = path.join(ROOT, 'logs')
const DAEMON_PID_FILE = path.join(RUN_DIR, 'daemon.pid')

/** 打包器写入的环境名标记（缺省环境；显式 --env 优先） */
const DEPLOY_ENV_FILE = path.join(ROOT, '.deploy-env')

/** 各应用的生产入口脚本（相对各自应用目录；与 scripts/pm2-config.mjs 同口径） */
const SCRIPT_PATH = {
  server: path.join('dist', 'main.js'),
  admin: path.join('.output', 'server', 'index.mjs'),
  geo: path.join('.output', 'server', 'index.mjs')
}

/** 各应用的就绪探测路径（与仓库侧 scripts/release.mjs 同口径；geo 首页无前缀可能 404，能响应即算存活） */
const PROBE_PATH = { server: '/geoserver/health', admin: '/geocms/', geo: '/' }

/** 崩溃重启参数：间隔与连续上限（稳定运行 60s 后计数清零，避免长时间运行累计误伤） */
const RESTART_DELAY_MS = 4000
const MAX_RESTARTS = 10
const STABLE_RESET_MS = 60_000

/** 状态探测的单次请求超时 */
const STATUS_TIMEOUT_MS = 1500

const IS_WIN = process.platform === 'win32'

/** @type {Map<string, { child: import('node:child_process').ChildProcess, restarts: number, startedAt: number }>} */
const running = new Map()
let stopping = false

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const usage = [
  '用法：node start.mjs [命令] [应用...] [选项]',
  '',
  '  命令（缺省 start）',
  '    start     前台运行全部应用（Ctrl+C 一并结束）',
  '    daemon    后台守护运行（SSH 断开不影响；日志 logs/、pid .run/）',
  '    stop      结束后台守护与全部子进程',
  '    status    查看守护进程与各应用端口健康',
  '    restart   重启后台守护（stop → daemon）',
  '  应用        server / admin / geo（可选，缺省全部；restart 不支持按应用）',
  '  --env       运行环境（缺省读打包时写入的 .deploy-env，再缺省 production）',
  '',
  '  数据库上线请用另一条命令（结构与代码分离）：node db.mjs status | deploy | seed'
].join('\n')

/** 解析命令行：首个参数为命令（缺省 start），其余为应用名过滤；--env 指定环境 */
function parseArgs(argv) {
  const commands = new Set(['start', 'daemon', 'stop', 'status', 'restart', 'daemon-worker'])
  let command
  let appEnv
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
    if (arg === '--help' || arg === '-h') {
      console.log(usage)
      process.exit(0)
    }
    if (index === 0 && commands.has(arg)) {
      command = arg
      continue
    }
    targets.push(arg)
  }
  return { command: command || 'start', appEnv, targets }
}

/** 校验应用名过滤参数；空则返回全部应用 */
function resolveTargets(targets) {
  if (!targets.length) return [...APP_NAMES]
  for (const name of targets) findApp(name)
  return [...new Set(targets)]
}

/** 读取打包时的环境名：.deploy-env 标记 → 显式 --env 优先 */
function resolveAppEnvName(fromArgv) {
  if (fromArgv) return fromArgv
  try {
    const packed = fs.readFileSync(DEPLOY_ENV_FILE, 'utf8').trim()
    if (packed) return packed
  } catch {
    /* 标记缺失时走缺省值 */
  }
  return 'production'
}

/** 后台守护是否在运行（pid 文件存在且进程存活）；返回 pid 或 null */
function readDaemonPid() {
  try {
    const pid = Number(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim())
    if (!pid) return null
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

/** 打包器产物自检：入口脚本缺失直接报错退出（缺哪个补哪个，别带病启动） */
function assertScripts(names) {
  const missing = names.filter((name) => !fs.existsSync(path.join(ROOT, findApp(name).dir, SCRIPT_PATH[name])))
  if (missing.length) {
    console.error(
      `[${TAG}] 入口脚本缺失：${missing.map((name) => `${findApp(name).title}（${SCRIPT_PATH[name]}）`).join('、')}`
    )
    console.error(`[${TAG}] 部署包不完整——请回本地重新执行 pnpm release --build-only && pnpm pack:deploy 后整体覆盖`)
    process.exit(1)
  }
}

/** 打开应用日志流（daemon 模式；append 追加） */
function openLogStreams(name) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  return {
    out: fs.createWriteStream(path.join(LOG_DIR, `${name}-out.log`), { flags: 'a' }),
    err: fs.createWriteStream(path.join(LOG_DIR, `${name}-err.log`), { flags: 'a' })
  }
}

/** 追加一条守护事件日志（daemon 模式的自身事件：启动 / 停止 / 重启放弃） */
function appendDaemonLog(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(path.join(LOG_DIR, 'daemon.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* 日志失败不影响守护 */
  }
}

/** 前台模式：子进程输出按行加应用前缀，直接落到当前终端 */
function pipeWithPrefix(stream, name, color) {
  if (!stream) return
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) process.stdout.write(`${color}[${name}]${COLOR_RESET} ${line}\n`)
  })
  stream.on('end', () => {
    if (buffer) process.stdout.write(`${color}[${name}]${COLOR_RESET} ${buffer}\n`)
  })
}

/** 结束一个子进程树（Windows taskkill 连树强杀；POSIX 结束独立进程组） */
function killTree(child) {
  if (!child.pid || child.exitCode !== null) return
  try {
    if (IS_WIN) execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    /* 已退出 */
  }
}

/**
 * 拉起单个应用并挂上崩溃守护
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string} name 应用短名
 * @param {{ daemon?: boolean }} [options] daemon 时输出重定向到 logs/
 */
function startOne(config, name, options = {}) {
  const app = findApp(name)
  const child = spawn(process.execPath, [SCRIPT_PATH[name]], {
    cwd: path.join(ROOT, app.dir),
    env: buildAppEnv(config, name),
    /** POSIX 下独立进程组，便于整组回收；daemon worker 自身已是独立进程组，子进程随之归组 */
    detached: !IS_WIN && !options.daemon,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (options.daemon) {
    const streams = openLogStreams(name)
    child.stdout.pipe(streams.out)
    child.stderr.pipe(streams.err)
  } else {
    pipeWithPrefix(child.stdout, app.name, app.color)
    pipeWithPrefix(child.stderr, app.name, app.color)
  }

  running.set(name, { child, restarts: 0, startedAt: Date.now() })

  child.on('exit', (code, signal) => {
    const record = running.get(name)
    if (!record || record.child !== child) return
    const reason = signal ? `信号 ${signal}` : `退出码 ${code}`
    if (stopping) return
    /** 稳定运行超过阈值后清零重启计数（长期运行中偶发一次崩溃不该累计到上限） */
    if (Date.now() - record.startedAt > STABLE_RESET_MS) record.restarts = 0
    record.restarts += 1
    if (record.restarts > MAX_RESTARTS) {
      const message = `${app.title} 连续重启 ${record.restarts - 1} 次仍退出，已放弃守护（${reason}），请查看日志排查`
      console.error(`[${TAG}] ${message}`)
      appendDaemonLog(`[放弃] ${message}`)
      return
    }
    const message = `${app.title} 已退出（${reason}），${RESTART_DELAY_MS / 1000}s 后第 ${record.restarts} 次重启`
    if (options.daemon) appendDaemonLog(`[重启] ${message}`)
    else console.warn(`[${TAG}] ${message}`)
    setTimeout(() => {
      if (stopping) return
      startOne(config, name, options)
    }, RESTART_DELAY_MS)
  })

  return child
}

/** 结束全部子进程（前台与 daemon worker 共用） */
function stopChildren() {
  stopping = true
  for (const { child } of running.values()) killTree(child)
}

/** 前台运行：拉起全部目标应用，Ctrl+C 一并结束 */
function runForeground(config, names) {
  console.log('─'.repeat(72))
  console.log(`[${TAG}] 前台运行（Ctrl+C 结束全部；长期运行请用 node start.mjs daemon）`)
  for (const line of describeConfig(config, names)) console.log(`  ${line}`)
  console.log('─'.repeat(72))

  for (const name of names) startOne(config, name)
  console.log(`[${TAG}] 已拉起 ${names.length} 个进程，等待就绪（node start.mjs status 可查健康）\n`)
  for (const line of describeEndpoints(config, names, {}, { lan: false })) console.log(line)
  console.log('')

  const shutdown = () => {
    if (stopping) return
    console.log(`\n[${TAG}] 正在结束全部进程…`)
    stopChildren()
    setTimeout(() => process.exit(0), 1500)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

/** 后台守护 worker（由 daemon 命令 detached 拉起；持有 pid 文件与日志） */
function runDaemonWorker(config, names) {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(DAEMON_PID_FILE, String(process.pid), 'utf8')
  appendDaemonLog(`守护启动 pid=${process.pid} 应用=${names.join(',')} 环境=${config.appEnv}`)

  for (const name of names) startOne(config, name, { daemon: true })
  appendDaemonLog(`已拉起 ${names.length} 个应用进程`)

  const shutdown = (signal) => {
    if (stopping) return
    appendDaemonLog(`收到 ${signal}，正在结束全部进程`)
    stopChildren()
    setTimeout(() => {
      try {
        fs.unlinkSync(DAEMON_PID_FILE)
      } catch {
        /* 已删除 */
      }
      appendDaemonLog('守护退出')
      process.exit(0)
    }, 1500)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  /** 守护进程尽量不倒：拦截未捕获异常，仅记录 */
  process.on('uncaughtException', (error) => appendDaemonLog(`[异常] uncaughtException: ${error.stack || error}`))
  process.on('unhandledRejection', (reason) =>
    appendDaemonLog(`[异常] unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`)
  )
}

/** 后台运行：detached 拉起自身 worker（新进程组），SSH 断开不影响 */
function startDaemon(config, names) {
  if (readDaemonPid()) {
    console.error(`[${TAG}] 后台守护已在运行（node start.mjs status 查看；重启用 node start.mjs restart）`)
    process.exit(1)
  }
  assertScripts(names)
  const args = [SELF_FILE, 'daemon-worker', '--env', config.appEnv, ...names]
  const worker = spawn(process.execPath, args, {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: process.env
  })
  worker.unref()
  console.log('─'.repeat(72))
  console.log(`[${TAG}] 后台守护已启动（环境 ${config.appEnv}，应用 ${names.join(' / ')}）`)
  console.log(`[${TAG}] 查看健康：node start.mjs status    日志：logs/<应用>-out.log / -error.log`)
  console.log(`[${TAG}] 结束：node start.mjs stop          数据库上线：node db.mjs deploy`)
  console.log('─'.repeat(72))
}

/** 结束后台守护：杀 worker 进程组 / 进程树，并清理 pid 文件 */
function stopDaemon() {
  const pid = readDaemonPid()
  if (!pid) {
    console.log(`[${TAG}] 后台守护未在运行`)
    return
  }
  console.log(`[${TAG}] 正在结束后台守护（pid ${pid}）…`)
  try {
    if (IS_WIN) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-pid, 'SIGTERM')
  } catch {
    /* 进程已退出 */
  }
  /** Windows taskkill 强杀不给 worker 清理机会：统一兜底删 pid 文件 */
  try {
    fs.unlinkSync(DAEMON_PID_FILE)
  } catch {
    /* 已删除 */
  }
  console.log(`[${TAG}] 已结束（日志保留在 logs/，可 node start.mjs daemon 重新拉起）`)
}

/** HTTP 探测：任何响应都算进程存活；无响应返回 0 */
async function probePort(port, probePath) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${probePath}`, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      redirect: 'manual'
    })
    return response.status
  } catch {
    return 0
  }
}

/** 查看状态：守护进程 + 各应用端口健康 */
async function showStatus(config, names) {
  const pid = readDaemonPid()
  console.log('─'.repeat(72))
  console.log(
    `[${TAG}] 后台守护  ${pid ? `运行中（pid ${pid}）` : '未运行（前台模式不在此显示；长期运行请用 daemon）'}`
  )
  for (const name of names) {
    const app = findApp(name)
    const status = await probePort(config.ports[name], PROBE_PATH[name] || '/')
    const state = status ? `HTTP ${status}（进程存活）` : '无响应（未启动 / 启动中 / 端口被占用，查 logs/）'
    console.log(`  ${app.title.padEnd(6)} 端口 ${config.ports[name]}  ${state}`)
  }
  console.log('─'.repeat(72))
}

async function main() {
  const { command, appEnv, targets } = parseArgs(process.argv.slice(2))
  const names = resolveTargets(targets)

  if (command === 'stop') {
    stopDaemon()
    return
  }

  const config = loadConfig({ appEnv: appEnv ?? resolveAppEnvName() })

  switch (command) {
    case 'daemon':
      assertScripts(names)
      startDaemon(config, names)
      return
    case 'restart':
      if (readDaemonPid()) stopDaemon()
      await delay(1000)
      assertScripts(names)
      startDaemon(config, names)
      return
    case 'status':
      await showStatus(config, names)
      return
    case 'daemon-worker':
      runDaemonWorker(config, names)
      return
    default:
      assertScripts(names)
      runForeground(config, names)
  }
}

main().catch((error) => {
  console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
