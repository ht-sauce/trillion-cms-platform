#!/usr/bin/env node
/**
 * 构建器（根命令：`pnpm build`）
 *
 * 为什么独立成一条命令：构建的**顺序约束**（共享类型包必须在服务端之前）与**环境注入**
 * （产物里的 API 基址、端口都来自 env/）原来散在 4 条脚本里（`build:shared` / `build:server`
 * / `build:admin` / `build:geo`），每加一个应用就多一条脚本，且谁先谁后全靠人记。
 * 现在收敛为一条命令 + 目标参数（决策见 ADR-044）。
 *
 * 用法：
 *   pnpm build                     # 全量：shared → server → admin → geo
 *   pnpm build server              # 只构建服务端（shared 自动先行）
 *   pnpm build shared              # 只构建共享类型包
 *   pnpm build admin geo           # 只构建两个前端
 *   pnpm build --env production    # 按 env/.env.production 构建（产物里的基址随之切换）
 *
 * 说明：
 * - `all` 与不写目标等价；应用顺序固定按 config/apps.mjs 的声明顺序（服务端在前，前端依赖其 API）
 * - 本命令只构建，**不启动进程、不碰数据库**；上线走 `pnpm release`，打包走 `pnpm bundle`
 */
import { APP_NAMES, SHARED_PACKAGE, buildAppEnv, findApp, loadConfig } from '../config/index.mjs'
import { exitWith, runPnpm, takeEnv, usageError } from './cli.mjs'

const TAG = '构建'

/** 可用的构建目标：`all` + 共享包 + 各应用短名 */
const TARGETS = ['all', 'shared', ...APP_NAMES]

const usage = [
  '用法：pnpm build [目标...] [--env <development|test|production>]',
  '',
  `  目标   all（缺省）/ shared / ${APP_NAMES.join(' / ')}`,
  '',
  '例：pnpm build              # 全量（shared → server → admin → geo）',
  '    pnpm build server      # 只构建服务端',
  '    pnpm build --env production'
].join('\n')

const { appEnv, rest } = takeEnv(process.argv.slice(2))

if (rest.includes('--help') || rest.includes('-h')) {
  console.log(usage)
  process.exit(0)
}

/** 目标解析：`all` / 不写 → 全部应用；否则按用户给定顺序去重（shared 由下方单独前置） */
const requested = rest.length ? [...new Set(rest)] : ['all']
const unknown = requested.filter((name) => !TARGETS.includes(name))
if (unknown.length) {
  usageError([`[${TAG}] 未知构建目标：${unknown.join('、')}（可选：${TARGETS.join(' / ')}）`, '', usage])
}

const all = requested.includes('all')
const wantShared = all || requested.includes('shared')
const wantApps = all ? APP_NAMES : requested.filter((name) => name !== 'shared' && name !== 'all')

const config = loadConfig({ appEnv })
console.log('─'.repeat(72))
console.log(`[${TAG}] 运行环境 ${config.appEnv}（${config.envFile}）`)
console.log(`[${TAG}] 构建目标 ${[wantShared ? 'shared' : null, ...wantApps].filter(Boolean).join(' → ')}`)
console.log('─'.repeat(72))

/** 构建一步：打印标题、计时、失败即中止（与上线器同口径，任一步失败都停在原地） */
async function step(label, pnpmArgs, env = {}) {
  const started = Date.now()
  console.log(`\n[${TAG}] ▶ ${label} …`)
  const code = await runPnpm(pnpmArgs, { env })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (code !== 0) {
    console.error(`\n[${TAG}] ✗ ${label} 失败（退出码 ${code}），已中止`)
    process.exit(code)
  }
  console.log(`[${TAG}] ✓ ${label} 完成（${seconds}s）`)
}

await exitWith(
  (async () => {
    /** 共享类型包永远先行：服务端 tsconfig 指向其 dist，两个前端也 import 它的类型 */
    if (wantShared) await step(`构建共享类型包（${SHARED_PACKAGE}）`, ['--filter', SHARED_PACKAGE, 'build'])
    for (const name of wantApps) {
      const app = findApp(name)
      await step(
        `构建 ${app.title}（${app.dir}）`,
        ['--filter', app.packageName, app.buildScript],
        buildAppEnv(config, name)
      )
    }
    console.log(`\n[${TAG}] 构建完成（${config.appEnv}）；未启动进程、未改动数据库`)
    return 0
  })()
)
