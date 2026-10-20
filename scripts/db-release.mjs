#!/usr/bin/env node
/**
 * 数据库上线器：把数据库结构（Prisma 迁移）**增量发布**到测试 / 生产库
 *
 * 为什么独立成一个命令（而不是并进 `pnpm release:*`）：
 * 结构变更与代码发布是两件事——执行时机可能不同（先加字段再上代码，或先上代码再回填）、
 * 影响面不同（迁移不可回滚、可能锁表）、审计点不同（谁在何时改了哪个库）。
 * 因此：**代码上线器（`scripts/release.mjs`）绝不执行迁移**，结构变更一律由本命令显式执行；
 * 代码上线器的体检只做只读检查，发现结构落后会拦下并提示执行本命令。
 *
 * 用法：
 *   pnpm db:status                  # 只读：看目标库结构与「已应用 / 未应用」迁移（等价 --check）
 *   pnpm db:deploy                  # development 库：增量应用未执行的迁移
 *   pnpm db:deploy:test             # 测试库（env/.env.test）
 *   pnpm db:deploy:prod             # 生产库（env/.env.production）
 *   pnpm db:deploy --env production # 等价写法（--env 亦可放在命令前）
 *
 * 选项：
 *   --check          只体检（配置 + 连通 + 待应用迁移清单），不执行任何变更
 *   --force          忽略体检中的阻断项
 *   --help           打印本说明
 *
 * 流程（任一步失败立即中止，不会进入下一步）：
 *   1) 体检：环境文件 / 必填变量 / 目标库与连接串 / 生产库口令等上线风险项
 *   2) 只读检查：`prisma migrate status` 给出「已最新 / 待应用 / 库不存在 / 不可达」
 *   3) 增量发布：`prisma migrate deploy`（按 `apps/server/prisma/schema/migrations` 顺序只应用未执行的迁移，
 *      非交互、幂等；目标库不存在时自动建库）
 *   4) 复核：再次 `migrate status` 确认结构已最新
 *
 * 说明：
 * - 上线顺序：含结构变更时先跑本命令、再跑 `pnpm release:<环境>`（代码上线器的体检会强制这个顺序，`--force` 可跳过）
 * - 本命令**只做增量应用**，永远不会 reset / push 覆盖；迁移 SQL 由开发侧手工写入 `prisma/schema/migrations/`（见 docs/spec/04 §6）
 * - 首次部署：`pnpm db:deploy:prod`（建库 + 全部迁移）→ `node scripts/exec.mjs server prisma:seed --env production`（按需种子）
 */
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT, buildAppEnv, findApp, loadConfig } from '../config/index.mjs'
import { spawnPnpm } from './pnpm.mjs'

/** 日志前缀（与开发启动器 [启动器]、代码上线器 [上线器] 区分） */
const TAG = '数据库'

/** 迁移所归属的应用：连接串与迁移目录都由服务端配置派生 */
const DB_APP = 'server'

/** 迁移目录（相对仓库根，仅用于展示与自查） */
const MIGRATIONS_DIR = path.join('apps', 'server', 'prisma', 'schema', 'migrations')

const usage = [
  '用法：node scripts/db-release.mjs --env <development|test|production> [选项]',
  '',
  '  --check   只体检（配置 + 连通 + 待应用迁移清单），不执行任何变更',
  '  --force   忽略体检中的阻断项',
  '',
  '只做增量应用（prisma migrate deploy），不会 reset / push；空库会自动建库。',
  '',
  '例：pnpm db:status / pnpm db:deploy / pnpm db:deploy:test / pnpm db:deploy:prod'
].join('\n')

/** 解析命令行：`--env <name>` / `--env=<name>` / 布尔选项（无位置参数） */
function parseArgs(argv) {
  let appEnv
  const flags = new Set()
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
    if (arg.startsWith('--')) flags.add(arg.replace(/^--/, ''))
  }
  return { appEnv, flags }
}

/**
 * 执行一个包脚本并等待结束（迁移步骤日志直接继承到终端，便于看清 Prisma 输出）
 * @param {string[]} pnpmArgs
 * @param {Record<string, string>} [env]
 * @returns {Promise<number>} 退出码
 */
function runInherit(pnpmArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(pnpmArgs, { cwd: REPO_ROOT, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/**
 * 执行一个包脚本并回收输出（用于需要判定结果的只读检查）
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

/** 体检项：level 为 error 时阻断执行（除 --force） */
function check(level, label, detail) {
  return { level, label, detail }
}

/**
 * 体检：数据库命令直连目标库改结构，因此把「改错库」的风险项查在前面
 * @param {ReturnType<typeof loadConfig>} config
 */
function inspect(config) {
  const results = []
  const isProd = config.appEnv === 'production'
  const password = String(config.database.password ?? '').trim()

  results.push(check('ok', '运行环境', `${config.appEnv}（${path.relative(config.root, config.envFile)}）`))
  results.push(
    check(
      'ok',
      '目标库',
      `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`
    )
  )
  results.push(check('ok', '迁移目录', `${MIGRATIONS_DIR}（增量应用，不 reset）`))

  /** 生产库口令为空是「改错库」的典型信号（本地 root 无口令），命令本身直连改结构，故按阻断处理 */
  if (isProd && !password) {
    results.push(check('error', 'DB_PASSWORD', '生产环境数据库口令为空，请先在 env/.env.production 配置强口令'))
  }

  /** 口令里还是占位值：说明生产文件尚未真正填写 */
  if (isProd && /(please[-_]?change|change[-_]?me|your[-_]|placeholder)/i.test(password)) {
    results.push(check('error', 'DB_PASSWORD', '口令疑似占位值，请在 env/.env.production 替换为真实口令'))
  }

  return results
}

/** 打印体检结果，返回阻断项数量 */
function printChecks(results) {
  const marks = { ok: 'ok  ', warn: 'warn', error: 'fail' }
  console.log(`\n[${TAG}] 体检`)
  for (const item of results) console.log(`  [${marks[item.level]}] ${item.label}  ${item.detail}`)
  return results.filter((item) => item.level === 'error').length
}

/**
 * 只读检查：`prisma migrate status`（有未应用迁移 / 库不存在时它返回非零退出码，属正常情况）
 * @param {ReturnType<typeof loadConfig>} config
 * @returns {Promise<{ verdict: 'unreachable'|'missing'|'pending'|'current', output: string }>}
 */
async function inspectMigrations(config) {
  const env = { ...process.env, ...buildAppEnv(config, DB_APP) }
  const { output } = await runCapture(['--filter', findApp(DB_APP).packageName, 'prisma:status'], env)
  /** Prisma 错误码与固定文案：P1001 不可达 / P1000 认证失败 / P1003 库不存在 */
  const unreachable =
    /P1001|P1000|Can't reach database server|Authentication failed|Environment variable not found/i.test(output)
  const missingDb = /P1003|does not exist/i.test(output)
  const pending = /have not yet been applied|Following migration/i.test(output)

  console.log(
    `\n[${TAG}] 结构现状（${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}）`
  )
  for (const line of output.split(/\r?\n/)) if (line.trim()) console.log(`  ${line.trim()}`)

  if (unreachable) {
    console.log('  → 数据库不可达或凭据无效：请确认 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME')
    return { verdict: 'unreachable', output }
  }
  if (missingDb) {
    console.log('  → 目标库尚不存在：deploy 会自动建库并应用全部迁移（首次部署属正常）')
    return { verdict: 'missing', output }
  }
  if (pending) {
    console.log('  → 存在未应用的迁移：本命令只应用这些（幂等，已应用的不会重跑）')
    return { verdict: 'pending', output }
  }
  console.log('  → 结构已是最新，无需应用迁移')
  return { verdict: 'current', output }
}

/** 仅在被直接执行时运行（便于被测试脚本引用） */
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}

async function main() {
  const { appEnv, flags } = parseArgs(process.argv.slice(2))
  if (flags.has('help')) {
    console.log(usage)
    return
  }

  const config = loadConfig({ appEnv })
  const checkOnly = flags.has('check')

  console.log('─'.repeat(72))
  console.log(`[${TAG}] 数据库结构${checkOnly ? '检查（--check，不执行变更）' : '增量发布'}`)
  console.log('─'.repeat(72))

  /** 1) 体检 */
  const errors = printChecks(inspect(config))
  if (errors && !flags.has('force')) {
    console.error(`\n[${TAG}] 体检未通过（${errors} 项阻断），已中止；修正后重跑，或用 --force 强行继续`)
    process.exit(1)
  }
  if (errors) console.warn(`[${TAG}] 已用 --force 忽略 ${errors} 项阻断，请自行确认风险`)

  /** 2) 只读检查：确认目标库与待应用迁移 */
  const status = await inspectMigrations(config)
  if (status.verdict === 'unreachable') {
    console.error(`\n[${TAG}] 数据库不可达，已中止（配置见 env/.env.${config.appEnv}）`)
    process.exit(1)
  }

  if (checkOnly) {
    const notes = {
      pending: '有未应用迁移：执行 pnpm db:deploy 后即可（本命令不自动执行）',
      missing: '目标库不存在：执行 pnpm db:deploy 会自动建库并应用全部迁移',
      current: '结构已最新'
    }
    console.log(`\n[${TAG}] 检查完成——${notes[status.verdict]}`)
    return
  }

  if (status.verdict === 'current') {
    console.log(`\n[${TAG}] 无需发布：结构已是最新`)
    return
  }

  /** 3) 增量发布 */
  const started = Date.now()
  console.log(`\n[${TAG}] ▶ 增量应用迁移（prisma migrate deploy，目标库 ${config.database.name}）…`)
  const code = await runInherit(['--filter', findApp(DB_APP).packageName, 'prisma:deploy'], {
    ...buildAppEnv(config, DB_APP)
  })
  if (code !== 0) {
    console.error(`\n[${TAG}] ✗ 迁移失败（退出码 ${code}）；库可能停在中间状态，请先 pnpm db:status 查看现状再重跑`)
    process.exit(code)
  }
  console.log(`[${TAG}] ✓ 迁移完成（${((Date.now() - started) / 1000).toFixed(1)}s）`)

  /** 4) 复核：确认结构已最新 */
  const verified = await inspectMigrations(config)
  if (verified.verdict !== 'current') {
    console.warn(`\n[${TAG}] 警告：复核结果不为「已最新」，请执行 pnpm db:status 确认`)
    process.exit(1)
  }
  console.log(
    `\n[${TAG}] 数据库结构已更新（${config.database.name}）；代码上线请另执行 pnpm release --env ${config.appEnv}`
  )
}
