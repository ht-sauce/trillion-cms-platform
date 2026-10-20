#!/usr/bin/env node
/**
 * 部署包数据库入口：结构变更的唯一改库命令（ADR-042；两条命令分离原则见 ADR-034）
 *
 * 本文件随 `pnpm pack:deploy` 进入部署包根目录，直接调用包内 apps/server 自带的
 * prisma CLI（migrate）与 tsx（seed），服务器无需 pnpm：
 *
 *   node db.mjs status    # 只读：目标库 + 已应用 / 未应用迁移 + 连通性
 *   node db.mjs deploy    # 增量应用未执行的迁移（幂等、非交互、空库自动建库）
 *   node db.mjs seed      # 可选：初始化管理员与示例站点（首次部署按需执行）
 *
 * 环境缺省读打包时写入的 `.deploy-env`，可用 `node db.mjs deploy --env test` 覆盖。
 * 只做增量应用：永远不会 reset 或 db push（与仓库侧 `pnpm db:deploy*` 完全同口径）。
 */
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findApp } from './config/apps.mjs'
import { buildAppEnv, loadConfig } from './config/index.mjs'

/** 日志前缀 */
const TAG = '数据库'

/** 部署包根目录（本文件位于包根） */
const ROOT = fileURLToPath(new URL('.', import.meta.url))

/** 打包器写入的环境名标记（缺省环境；显式 --env 优先） */
const DEPLOY_ENV_FILE = path.join(ROOT, '.deploy-env')

/** 服务端包目录（prisma schema / 迁移 / node_modules 都在这里） */
const SERVER_DIR = path.join(ROOT, findApp('server').dir)

/** prisma CLI 与 tsx 的入口（pnpm deploy --node-linker=hoisted 产出的实体文件，无 symlink） */
const PRISMA_BIN = path.join(SERVER_DIR, 'node_modules', 'prisma', 'build', 'index.js')
const TSX_BIN = path.join(SERVER_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const SCHEMA_ARG = '--schema=prisma/schema'

const usage = [
  '用法：node db.mjs <status|deploy|seed> [--env <环境>]',
  '',
  '  status    只读：查看目标库、已应用 / 未应用迁移与连通性',
  '  deploy    增量应用未执行的迁移（幂等、非交互、空库自动建库；唯一的改结构入口）',
  '  seed      初始化管理员与示例站点（仅首次部署按需执行；重复执行以更新语义为准）',
  '',
  '  代码更新不执行迁移：结构与代码是两条命令——先 node db.mjs deploy，再 node start.mjs restart'
].join('\n')

/** 解析命令行：子命令 + --env */
function parseArgs(argv) {
  let appEnv
  const rest = []
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
    rest.push(arg)
  }
  return { subcommand: rest[0], appEnv }
}

/** 读取打包时的环境名：.deploy-env 标记 → 显式 --env 优先（与 start.mjs 同口径） */
function resolveEnvName(fromArgv) {
  if (fromArgv) return fromArgv
  try {
    const packed = fs.readFileSync(DEPLOY_ENV_FILE, 'utf8').trim()
    if (packed) return packed
  } catch {
    /* 标记缺失时走缺省值 */
  }
  return 'production'
}

/**
 * 以服务端包目录为 cwd、派生环境变量执行一个命令并等待结束
 * @param {string} label 日志前缀描述
 * @param {string} command 可执行文件（process.execPath）
 * @param {string[]} args 参数数组（**必须逐项传入**：spawn 不做 shell 分词，`'migrate status'`
 *   这种带空格的整体串会被 prisma 当成未知命令并打印 help）
 * @param {string} appEnv 环境名（由命令行 --env 或 .deploy-env 决定）
 */
function runInServer(label, command, args, appEnv) {
  return new Promise((resolve, reject) => {
    const config = loadConfig({ appEnv })
    const env = buildAppEnv(config, 'server')
    console.log(
      `[${TAG}] ▶ ${label}（${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}）…`
    )
    const child = spawn(command, args, { cwd: SERVER_DIR, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const subcommand = parsed.subcommand
  /** 环境名：显式 --env 优先，缺省读打包时写入的 .deploy-env（再缺省 production） */
  const appEnv = resolveEnvName(parsed.appEnv)
  if (!['status', 'deploy', 'seed'].includes(subcommand)) {
    console.log(usage)
    process.exit(subcommand ? 1 : 0)
  }
  if (subcommand !== 'seed' && !fs.existsSync(PRISMA_BIN)) {
    console.error(`[${TAG}] 部署包不完整：未找到 prisma CLI（node_modules/prisma）——请回本地重新执行 pnpm pack:deploy`)
    process.exit(1)
  }

  let code
  if (subcommand === 'seed') {
    if (!fs.existsSync(TSX_BIN)) {
      console.error(`[${TAG}] 部署包不完整：未找到 tsx（node_modules/tsx）——请回本地重新执行 pnpm pack:deploy`)
      process.exit(1)
    }
    code = await runInServer('初始化种子数据', process.execPath, [TSX_BIN, 'prisma/seed.ts'], appEnv)
  } else {
    code = await runInServer(
      subcommand === 'deploy' ? '增量应用迁移（migrate deploy）' : '迁移状态检查（migrate status）',
      process.execPath,
      [PRISMA_BIN, 'migrate', subcommand, SCHEMA_ARG],
      appEnv
    )
  }

  if (code !== 0) {
    console.error(`\n[${TAG}] ✗ 命令失败（退出码 ${code}）：先确认 MySQL 可达与 env/ 内 DB_* 配置，再重试`)
    process.exit(code)
  }
  console.log(`\n[${TAG}] ✓ 完成（本命令只做增量应用，绝不 reset / db push）`)
}

main().catch((error) => {
  console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
