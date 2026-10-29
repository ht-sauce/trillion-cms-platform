#!/usr/bin/env node
/**
 * 数据库命令（根命令：`pnpm db <动作>`）
 *
 * 为什么合并：数据库相关脚本原来有 12 条（`db:migrate` / `db:deploy[:test|:prod]` /
 * `db:status[:test|:prod]` / `db:generate` / `db:push` / `db:seed` / `db:backfill` / `db:studio`），
 * 其中 6 条只是「同一动作 × 三个环境」的笛卡尔积 —— 环境本该是参数（ADR-044）。
 *
 * 用法：
 *   pnpm db status                    # 只读：目标库 + 已应用 / 未应用迁移 + 连通性
 *   pnpm db deploy                    # 增量应用未执行的迁移（唯一改结构入口）
 *   pnpm db deploy --env production   # 生产库（env/.env.production）
 *   pnpm db generate                  # 重新生成 Prisma Client
 *   pnpm db seed                      # 种子数据（幂等）
 *
 * 动作一览：
 *   status   只读检查（= `db-release.mjs --check`）
 *   deploy   体检 → `prisma migrate deploy` → 复核（唯一改结构入口，幂等、不 reset）
 *   migrate  本地开发用 `prisma migrate dev`（会改结构并可能提示 reset，**仅限 development**）
 *   push     `prisma db push`：直接把 schema 同步到库（不产生迁移文件，**仅限 development**）
 *   generate 重新生成 Prisma Client（构建已内置，仅在怀疑客户端是占位 stub 时兜底）
 *   seed     种子数据
 *   backfill 历史数据回填
 *   studio   打开 Prisma Studio
 *
 * 分工不变（ADR-034）：`deploy` 改结构、`pnpm release` 只发代码且只做只读检查；
 * 有结构变更时顺序仍是「先 `pnpm db deploy` 再 `pnpm release`」。
 */
import { buildAppEnv, findApp, loadConfig } from '../config/index.mjs'
import { exitWith, runNode, runPnpm, takeEnv, usageError } from './cli.mjs'

const TAG = '数据库'

/** 数据库操作归属的应用（连接串与迁移目录都由服务端配置派生） */
const DB_APP = 'server'

/** 只做增量应用 / 只读检查的动作：交给 `db-release.mjs`（体检 + 复核都在它里面） */
const DELEGATED = { deploy: [], status: ['--check'] }

/** 直接转发明细给服务端包脚本的动作 → `apps/server` 的脚本名与说明 */
const DIRECT = {
  migrate: { script: 'prisma:migrate', note: '仅限 development：会改结构，可能提示 reset' },
  push: { script: 'prisma:push', note: '仅限 development：直接同步结构，不产生迁移文件' },
  generate: { script: 'prisma:generate', note: '重新生成 Prisma Client' },
  seed: { script: 'prisma:seed', note: '种子数据（幂等）' },
  backfill: { script: 'prisma:backfill', note: '历史数据回填' },
  studio: { script: 'prisma:studio', note: '打开 Prisma Studio' }
}

/** 只允许在本地开发库执行的动作（AGENTS.md §5 / 07 §3.5 明确禁止用于测试与生产） */
const DEV_ONLY = ['migrate', 'push']

const usage = [
  '用法：pnpm db <动作> [--env <development|test|production>] [--force]',
  '',
  '  status    只读：目标库 + 已应用 / 未应用迁移 + 连通性',
  '  deploy    增量应用未执行的迁移（唯一改结构入口；空库自动建库）',
  '  migrate   本地开发用 prisma migrate dev（仅 development）',
  '  push      直接同步结构（仅 development）',
  '  generate  重新生成 Prisma Client',
  '  seed      种子数据',
  '  backfill  历史数据回填',
  '  studio    打开 Prisma Studio',
  '',
  '例：pnpm db status / pnpm db deploy --env production / pnpm db seed',
  '说明：本命令改数据库；代码上线走 pnpm release（只发代码，不碰数据库）'
].join('\n')

const { appEnv, rest } = takeEnv(process.argv.slice(2))
const action = rest[0]
const extra = rest.slice(1)

if (!action || action === '--help' || action === '-h') {
  console.log(usage)
  process.exit(action ? 0 : 1)
}

if (!DELEGATED[action] && !DIRECT[action]) {
  usageError([
    `[${TAG}] 未知动作：${action}（可选：${[...Object.keys(DELEGATED), ...Object.keys(DIRECT)].join(' / ')}）`,
    '',
    usage
  ])
}

/** 环境名透传给 `db-release.mjs`：它自己解析 `--env` 并做体检 */
const envArgs = appEnv ? ['--env', appEnv] : []
const config = loadConfig({ appEnv })

/** 测试 / 生产库禁止 migrate 与 push：这两条会按 schema 直接改结构，绕过迁移历史 */
if (DEV_ONLY.includes(action) && config.appEnv !== 'development' && !extra.includes('--force')) {
  usageError([
    `[${TAG}] ${action} 仅限本地开发库：当前目标是 ${config.appEnv}`,
    `  结构变更唯一入口是 pnpm db deploy --env ${config.appEnv}（增量应用迁移，幂等、不 reset）`,
    '  确需在非开发库直接同步结构时加 --force，并自行确认风险'
  ])
}

if (DELEGATED[action]) {
  console.log(`[${TAG}] ${action}（${config.appEnv}）→ scripts/db-release.mjs ${DELEGATED[action].join(' ')}`)
  await exitWith(runNode('scripts/db-release.mjs', [...DELEGATED[action], ...envArgs, ...extra]))
} else {
  const { script, note } = DIRECT[action]
  console.log(`[${TAG}] ${action}（${config.appEnv}）→ ${findApp(DB_APP).packageName} ${script} —— ${note}`)
  await exitWith(
    runPnpm(['--filter', findApp(DB_APP).packageName, script, ...extra], { env: buildAppEnv(config, DB_APP) })
  )
}
