#!/usr/bin/env node
/**
 * 本地开发启动器（根命令：pnpm allDev）
 *
 * 用途：一条命令拉起全部工程，且启动前先结束占用端口的旧进程，避免「端口被占用」反复排查。
 *
 * 用法：
 *   pnpm allDev                  # 启动全部工程（默认 development 环境）
 *   pnpm allDev --env test       # 用 env/.env.test 启动（测试端口 3100/3101/3102）
 *   pnpm allDev admin geo        # 只启动指定工程
 *   pnpm dev:admin               # 等价于 pnpm allDev admin
 *
 * 流程：
 *   1) 解析环境名与目标工程 → 读取根 config/ 全局配置（端口、API 基址、数据库）
 *   2) 结束占用目标端口的旧进程（端口查询与结束逻辑在 ./port-guard.mjs，与上线器共用）
 *   3) 并发启动各工程，日志按应用前缀着色
 *   4) 入口清单打印两次并全程守护：
 *      - 摘要后先打一份（配置端口版），避免等 Nuxt 首次编译期间终端没有任何地址信息；
 *      - 全部就绪且日志静默 5s 后再打一份（实际端口版）；
 *      - 之后任何日志把清单顶出屏幕都会自动补打（首次静默 3s，之后每 12s 冷却一次），
 *        并把清单落盘到仓库根 dev-endpoints.txt 兜底
 *   5) Ctrl+C 时回收全部子进程（含其派生的 nuxt / nest 子进程）
 */
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { COLOR_RESET } from '../config/apps.mjs'
import {
  APP_NAMES,
  REPO_ROOT,
  buildAppEnv,
  describeConfig,
  describeEndpoints,
  findApp,
  loadConfig
} from '../config/index.mjs'
import { freePort, findListeningPorts, findPortPids, killPid } from './port-guard.mjs'
import { spawnPnpm } from './pnpm.mjs'

const IS_WIN = process.platform === 'win32'

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const children = new Map()
let stopping = false
let exited = 0

/** 最近一次子进程输出的时间戳：用于打印入口前等待日志静默（毫秒） */
let lastOutputAt = Date.now()

/** 入口清单内容与打印状态：清单打印后仍可能被子进程日志顶出屏幕（见 printEndpoints 注释） */
let endpointsLines = null
let printedAt = 0
let reprintCount = 0
/** @type {NodeJS.Timeout | null} */
let reprintTimer = null
/** 本轮「有新日志」的起始时刻：配合 `REPRINT_MAX_WAIT_MS` 计算最长等待 */
let reprintPendingAt = 0

/** 就绪等待参数（毫秒）：状态轮询间隔、最长等待、日志静默判定与静默等待上限 */
const POLL_INTERVAL_MS = 400
const READY_TIMEOUT_MS = 120_000
/**
 * 静默判定要大于「就绪日志 → 收尾日志」的间隔：
 * Nuxt 打印 `Local:` 后还会补 Nitro 构建与 warmed up 日志，且端口一监听就可能被判为就绪，
 * 阈值取小了会在收尾日志之前就把清单打出去（随后被顶出屏幕）；这里取 5s 更贴近「真正启动完成」
 */
const QUIET_IDLE_MS = 5000
const QUIET_MAX_MS = 30_000
/**
 * 清单补打参数（毫秒）：
 * - `REPRINT_IDLE_MS`：日志静默这么久就把清单补打到屏幕底部（每来一行新日志都重置计时，即 debounce）
 * - `REPRINT_MAX_WAIT_MS`：日志一直不停时最多等这么久强制补打一次，避免清单永远回不来
 * - `REPRINT_MAX`：补打总次数上限（长驻进程的兜底，正常开发远远用不到）
 */
const REPRINT_IDLE_MS = 3000
const REPRINT_MAX_WAIT_MS = 15_000
const REPRINT_MAX = 30

/** 入口清单落盘文件（写在仓库根，不入库）：终端日志刷屏时的兜底查看入口 */
const ENDPOINTS_FILE = 'dev-endpoints.txt'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 解析命令行：--env <name> / --env=<name> 之外的非选项参数视为目标应用 */
function parseArgs(argv) {
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
    if (arg.startsWith('-')) continue
    targets.push(arg)
  }
  return { appEnv, targets }
}

/** 子进程输出按行加应用前缀，便于多工程日志混排时辨认；onLine 用于识别启动完成标志 */
function pipeWithPrefix(stream, app, onLine) {
  if (!stream) return
  let buffer = ''
  const emit = (line) => {
    process.stdout.write(`${app.color}[${app.name}]${COLOR_RESET} ${line}\n`)
    onLine?.(line)
    /** 清单已打印后再出现日志 → 清单可能被顶出屏幕，安排静默后补打 */
    scheduleReprint()
  }
  stream.on('data', (chunk) => {
    lastOutputAt = Date.now()
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) emit(line)
  })
  stream.on('end', () => {
    if (buffer) emit(buffer)
  })
}

/** 终端着色用的 ANSI 转义（Nuxt 会给端口加粗，正则匹配前需剥离） */
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g

/** 应用短名 → 就绪信息：`{ at: 就绪时刻, port?: 日志中声明的实际监听端口 }` */
const readyInfo = new Map()

/** 从一行日志里取「关键词之后首个 URL 的端口」，如 `Local: http://localhost:3002/` */
function urlPortAfter(line, keyword) {
  const match = line.match(new RegExp(`${keyword}[\\s\\S]*?https?://[^\\s/:]+:(\\d+)`, 'i'))
  return match ? Number(match[1]) : undefined
}

/**
 * 判断一行日志是否代表工程「启动完成可访问」
 *
 * 以子进程自己的就绪日志为准（比只看端口更贴近真实状态）：
 * - 服务端（Nest）：`Nest application successfully started`
 * - 前端（Nuxt）：`➜ Local: http://localhost:<port>/`
 * 返回的 port 是实际监听端口：端口被占用时 Nuxt 会回退到相邻端口，此时与配置端口不一致。
 * @returns {{ ready: boolean, port?: number }}
 */
function detectReady(appName, line) {
  const clean = line.replace(ANSI_PATTERN, '')
  if (appName === 'server') {
    if (!/nest application successfully started/i.test(clean)) return { ready: false }
    return { ready: true, port: urlPortAfter(clean, 'running on') }
  }
  const port = urlPortAfter(clean, 'local:')
  return port ? { ready: true, port } : { ready: false }
}

/**
 * 等待目标工程启动完成
 *
 * 判据：子进程日志出现就绪标志（首选）或配置端口已进入监听（兜底，防日志文案变化）。
 * @returns {Promise<{ ready: string[], failed: string[], ports: Record<string, number> }>}
 *          ports 为实际监听端口，仅在 Nuxt 端口回退等情况下与配置端口不同
 */
async function waitForReady(config, names) {
  /** 短名 → 启动时刻 */
  const pending = new Map(names.map((name) => [name, Date.now()]))
  const ready = []
  const failed = []
  /** 短名 → 实际监听端口（日志声明端口与配置端口不一致时记录） */
  const ports = {}
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (pending.size && !stopping && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS)
    const listening = findListeningPorts()
    for (const [name, startedAt] of [...pending]) {
      const app = findApp(name)
      const child = children.get(name)
      /** 进程已退出说明启动失败，无需再等 */
      if (child && child.exitCode !== null) {
        pending.delete(name)
        failed.push(name)
        console.warn(`[启动器] ${app.title} 启动失败：进程已退出（端口 ${config.ports[name]} 未监听）`)
        continue
      }

      const info = readyInfo.get(name)
      const fallbackPort = info ? undefined : listening.has(config.ports[name]) ? config.ports[name] : undefined
      const port = info?.port ?? fallbackPort
      if (!port) continue

      if (port !== config.ports[name]) ports[name] = port
      pending.delete(name)
      ready.push(name)
      console.log(
        `[启动器] ${app.title} 已就绪：http://${config.urls.host}:${port}` +
          `（耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s${info ? '' : '，以端口监听判定'}）`
      )
      if (port !== config.ports[name]) {
        console.warn(
          `[启动器] 注意：${app.title} 实际监听 ${port}（配置端口 ${config.ports[name]}），下方入口按实际端口输出`
        )
      }
    }
  }

  if (stopping) return { ready, failed, ports }

  if (pending.size) {
    for (const name of pending.keys()) {
      failed.push(name)
      console.warn(
        `[启动器] 警告：${findApp(name).title} 在 ${READY_TIMEOUT_MS / 1000}s 内未就绪（端口 ${config.ports[name]} 未监听）`
      )
    }
  }
  return { ready, failed, ports }
}

/** 等待日志静默：日志会顶掉已打印的内容，入口清单要等子进程不再刷屏时再输出 */
async function waitForQuiet() {
  const deadline = Date.now() + QUIET_MAX_MS
  while (!stopping && Date.now() < deadline) {
    if (Date.now() - lastOutputAt >= QUIET_IDLE_MS) return
    await delay(150)
  }
}

/**
 * 打印入口清单（含局域网地址）
 *
 * 同一份清单会在两个时机打印，并由补打机制全程守护：
 * 1) 启动摘要之后（按配置端口）：就绪清单必须等所有工程就绪（Nuxt 首次编译较久），
 *    期间终端不能没有任何地址信息 —— 这一步保证「一开始就能看到」；
 * 2) 全部工程就绪且日志静默后（`waitForQuiet()` 之后，按实际监听端口覆盖）；
 * 此后任何日志把清单顶出屏幕，都由 `scheduleReprint()` 自动重打（首次静默 3s，之后每 12s 冷却一次）。
 */
function printEndpoints() {
  if (!endpointsLines) return
  console.log(`\n${'─'.repeat(72)}`)
  /** 补打时说明原因：避免用户以为清单重复输出是异常 */
  if (reprintCount > 0) {
    console.log(`[启动器] 上方日志较多，重新打印入口清单（第 ${reprintCount} 次）`)
  }
  for (const line of endpointsLines) console.log(line)
  console.log('─'.repeat(72))
  printedAt = Date.now()
}

/**
 * 把入口清单写入仓库根的 `dev-endpoints.txt`
 *
 * 终端刷屏（或用户滚动查看历史输出）时不一定能找到清单，落盘一份随时可查；
 * 写失败不影响启动流程，只在终端提示一句。
 * @param {string[]} lines 要写入的内容
 */
function writeEndpointsFile(lines) {
  if (!lines?.length) return
  try {
    fs.writeFileSync(path.join(REPO_ROOT, ENDPOINTS_FILE), `${lines.join('\n')}\n`, 'utf8')
  } catch (error) {
    console.warn(`[启动器] 写入 ${ENDPOINTS_FILE} 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 安排清单补打：清单被后续日志顶掉时，把它重新打到屏幕底部
 *
 * 采用 debounce + 最长等待：
 * - 每来一行新日志就把计时往后推（`REPRINT_IDLE_MS`），因此**日志一停，清单就会回到屏幕底部**；
 * - 日志持续不停时由 `REPRINT_MAX_WAIT_MS` 兜底，最多等这么久强制补打一次，避免清单永远回不来。
 * 这样既不会在一条日志刚出现时就把清单打散，也不会让「清单之后又来了几行日志」这种情况把地址彻底顶走。
 */
function scheduleReprint() {
  if (stopping || !endpointsLines || reprintCount >= REPRINT_MAX) return
  const now = Date.now()
  if (!reprintTimer) reprintPendingAt = now
  clearTimeout(reprintTimer)
  const waitMs = Math.min(REPRINT_IDLE_MS, Math.max(0, reprintPendingAt + REPRINT_MAX_WAIT_MS - now))
  reprintTimer = setTimeout(() => {
    reprintTimer = null
    reprintPendingAt = 0
    if (stopping || !endpointsLines) return
    /** 清单打印后没有新日志 → 清单仍在屏幕上，无需补打 */
    if (lastOutputAt <= printedAt) return
    reprintCount += 1
    printEndpoints()
  }, waitMs)
}

/** 启动单个工程（开发形态：跑各应用的 devScript，源码热更新） */
function startApp(config, name) {
  const app = findApp(name)
  /**
   * 端口统一由注入的 `PORT` 生效：Nest 直接读 `PORT`；Nuxt 由 `nuxt.config` 的 `devServer.port` 读取。
   * 注意不要用 `--port` 传参：经 pnpm 转发时 Nuxt 会把 `--port` 当成 rootDir 解析。
   */
  const args = ['--filter', app.packageName, app.devScript]

  const child = spawnPnpm(args, {
    cwd: config.root,
    env: { ...process.env, ...buildAppEnv(config, name) },
    stdio: ['ignore', 'pipe', 'pipe'],
    /** POSIX 下独立进程组，便于 Ctrl+C 时整组回收 */
    detached: !IS_WIN
  })

  /** 就绪标志只认子进程自己的日志（端口回退时「配置端口被监听」这一判据会失效） */
  const onLine = (line) => {
    if (readyInfo.has(name)) return
    const result = detectReady(name, line)
    if (result.ready) readyInfo.set(name, { at: Date.now(), port: result.port })
  }

  pipeWithPrefix(child.stdout, app, onLine)
  pipeWithPrefix(child.stderr, app, onLine)

  child.on('error', (error) => {
    console.error(`${app.color}[${app.name}]${COLOR_RESET} 启动失败：${error.message}`)
  })
  child.on('exit', (code, signal) => {
    const reason = signal ? `信号 ${signal}` : `退出码 ${code}`
    console.log(`${app.color}[${app.name}]${COLOR_RESET} 已退出（${reason}）`)
    exited += 1
    if (!stopping && exited === children.size) {
      console.log('[启动器] 全部工程已退出')
      process.exit(code ?? 0)
    }
  })

  children.set(name, child)
  return child
}

/** 结束全部子进程（含进程组），保证不留孤儿进程 */
function stopAll() {
  if (stopping) return
  stopping = true
  if (reprintTimer) clearTimeout(reprintTimer)
  console.log('\n[启动器] 收到中断信号，正在结束全部子进程…')
  for (const child of children.values()) {
    if (!child.pid) continue
    try {
      if (IS_WIN) execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
      else process.kill(-child.pid, 'SIGTERM')
    } catch {
      /** 已退出 */
    }
  }
  setTimeout(() => process.exit(0), 800)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)

/** 仅在被直接执行时启动（便于被测试脚本引用端口清理逻辑） */
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

/** 端口清理逻辑本身在 ./port-guard.mjs，此处再导出一次仅为兼容既有引用方 */
export { findListeningPorts, findPortPids, freePort, killPid }

if (!isDirectRun) {
  /** 被引用时不执行任何启动动作 */
} else {
  main().catch((error) => {
    console.error(`[启动器] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}

async function main() {
  const { appEnv, targets } = parseArgs(process.argv.slice(2))
  const names = [...new Set((targets.length ? targets : APP_NAMES).map((name) => findApp(name).name))]
  const config = loadConfig({ appEnv })

  const summaryLines = describeConfig(config, names)
  console.log('─'.repeat(72))
  for (const line of summaryLines) console.log(line)
  console.log('─'.repeat(72))

  /**
   * 摘要阶段就先给出完整入口（按配置端口）并落盘：
   * 就绪清单必须等所有工程（Nuxt 首次编译）就绪 + 日志静默才打印，期间终端只有编译日志；
   * 这里提前打印一份，并把它交给补打机制守护 —— 之后被任何编译日志顶掉都会自动重打，
   * 启动全程都不会出现「看不到地址」的空窗；就绪后再用实际监听端口覆盖同一文件
   */
  endpointsLines = [...summaryLines, '', ...describeEndpoints(config, names)]
  writeEndpointsFile(endpointsLines)
  printEndpoints()
  console.log(`[启动器] 入口地址已写入 ${ENDPOINTS_FILE}（终端刷屏时可随时打开该文件查看）`)
  console.log('[启动器] 启动前先释放端口，避免旧工程占用\n')

  for (const name of names) await freePort(config.ports[name], name)

  console.log('')
  for (const name of names) startApp(config, name)
  console.log(`\n[启动器] 已拉起 ${names.length} 个工程，等待端口就绪后打印访问入口（Ctrl+C 可随时结束）…`)

  const { failed, ports } = await waitForReady(config, names)
  if (stopping) return

  /** 就绪后仍有编译日志滚动，等静默再打印，保证入口清单留在屏幕底部 */
  await waitForQuiet()
  if (stopping) return

  /** 清单固化成数组：被后续日志顶掉时由 `scheduleReprint()` 原样补打 */
  endpointsLines = [
    ...(failed.length ? [`[启动器] 未就绪：${failed.join('、')}（下方对应入口可能暂不可访问，请查看其日志）`] : []),
    ...describeEndpoints(config, names, ports),
    failed.length
      ? '[启动器] 其余工程已就绪，按 Ctrl+C 结束全部进程'
      : '[启动器] 全部工程已拉起，按 Ctrl+C 结束全部进程',
    `[启动器] 终端刷屏时可直接查看 ${ENDPOINTS_FILE}（入口地址已落盘）`
  ]
  /** 覆盖为「实际监听端口」版（Nuxt 端口回退时与摘要里的配置端口不同）；补打计数归零，这份就绪清单被顶掉后尽快回来 */
  reprintCount = 0
  writeEndpointsFile(endpointsLines)
  printEndpoints()
}
