#!/usr/bin/env node
/**
 * 站点命令（根命令：`pnpm site <动作>`）
 *
 * 为什么合并：站点的「构建 / 导入 / 校验 / 合并 / 素材 / 产物验收」原来散在根脚本
 * （`build:sites`、`build:site`（与前者完全重名重复）、`site:bootstrap`、`site:check`、`site:merge`）
 * 和一堆「直接 `node scripts/xxx.mjs`」的裸调用里 —— 同一个领域六个入口，其中两个还是重复的（ADR-044）。
 *
 * 用法：
 *   pnpm site build --site xian-renai-skin          # 增量 SSG 构建指定站点
 *   pnpm site build --site xian-renai-skin --rebuild # 强制全量（产物资产与 chunk 清单错位时用）
 *   pnpm site bootstrap --file scripts/site.json    # 导入建站描述（服务端须已启动）
 *   pnpm site check scripts/site.json               # 校验收验描述与块声明是否对齐
 *   pnpm site merge --out scripts/site.json         # 合并 scripts/data 下的分片
 *   pnpm site assets                                # 站点素材入素材库并对账
 *   pnpm site verify apps/geo/sites/xian-renai-skin # 产物机械检查（12 项）
 *
 * 说明：
 * - `build` 走 GEO 项目的 `build:sites`（`apps/geo/scripts/build-sites.mjs`），需要服务端在跑
 *   （它按 API 取站点数据）；`--env` 决定取哪个环境的接口
 * - `check` / `verify` 是**只读校验**，不影响产物；`check` 校验描述文件，`verify` 校验已构建产物
 * - 其余动作的完整参数请直接看对应脚本头部注释（本命令只做转发，不重复解释）
 */
import { buildAppEnv, findApp, loadConfig } from '../config/index.mjs'
import { exitWith, runNode, runPnpm, takeEnv, usageError } from './cli.mjs'

const TAG = '站点'

/**
 * 动作 → 处理方式
 * - `pnpm`：经 GEO 项目的包脚本执行（需要注入 geo 的应用环境：API 基址、令牌等）
 * - `node`：直接跑某个脚本，参数原样透传（`withEnv` 表示该脚本自己解析 `--env`）
 */
const ACTIONS = {
  build: { kind: 'pnpm', script: 'build:sites', note: '增量 SSG 构建站点静态产物（需 --site）' },
  bootstrap: { kind: 'node', script: 'scripts/bootstrap-site.mjs', withEnv: true, note: '导入建站描述（需 --file）' },
  check: { kind: 'node', script: 'scripts/check-site-data.mjs', note: '建站描述契约校验（位置参数：描述文件）' },
  merge: { kind: 'node', script: 'scripts/merge-site-data.mjs', note: '合并 scripts/data 下的分片' },
  assets: { kind: 'node', script: 'scripts/upload-site-assets.mjs', note: '站点素材入素材库并对账' },
  verify: { kind: 'node', script: 'scripts/check-built-site.mjs', note: '产物机械检查（位置参数：产物目录）' }
}

const usage = [
  '用法：pnpm site <动作> [参数] [--env <development|test|production>]',
  '',
  ...Object.entries(ACTIONS).map(([name, item]) => `  ${name.padEnd(10)}${item.note}`),
  '',
  '例：pnpm site build --site xian-renai-skin --rebuild',
  '    pnpm site verify apps/geo/sites/xian-renai-skin',
  '    pnpm site bootstrap --file scripts/site.json --publish'
].join('\n')

const { appEnv, rest } = takeEnv(process.argv.slice(2))
const action = rest[0]
const extra = rest.slice(1)

if (!action || action === '--help' || action === '-h') {
  console.log(usage)
  process.exit(action ? 0 : 1)
}

const handler = ACTIONS[action]
if (!handler) {
  usageError([`[${TAG}] 未知动作：${action}（可选：${Object.keys(ACTIONS).join(' / ')}）`, '', usage])
}

const config = loadConfig({ appEnv })
const app = findApp('geo')

if (handler.kind === 'pnpm') {
  console.log(`[${TAG}] ${action}（${config.appEnv}）→ ${app.packageName} ${handler.script}`)
  await exitWith(runPnpm(['--filter', app.packageName, handler.script, ...extra], { env: buildAppEnv(config, 'geo') }))
} else {
  /** 只有 `bootstrap` 自己解析 `--env`：其余脚本不认识它，传下去会被当成位置参数 */
  const args = handler.withEnv ? [...extra, ...(appEnv ? ['--env', appEnv] : [])] : extra
  console.log(`[${TAG}] ${action} → ${handler.script}`)
  await exitWith(runNode(handler.script, args))
}
