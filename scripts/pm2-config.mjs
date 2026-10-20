#!/usr/bin/env node
/**
 * PM2 配置生成器：把全局配置（env/ 值 + config/ 派生）落成 PM2 原生 JSON 配置
 *
 * 三个脚本与 PM2 的分工：
 * - `scripts/dev.mjs`（开发启动器）：源码直跑，前台托管
 * - `scripts/release.mjs`（上线器，`--build-only`）：体检 + 构建，不启动进程
 * - 本文件 + PM2：**进程守护**——生成 `ecosystem.config.json` 后，启动 / 重载 / 开机自启全部交给 PM2
 *   （决策见 docs/spec/08-adr.md ADR-041，操作手册见 docs/spec/10-launch-runbook.md）
 *
 * **为什么生成而不是手写 ecosystem.config.js**：端口 / 连接串 / API 基址 / 密钥的唯一事实来源是
 * `env/.env.<环境>` + `config/index.mjs`（应用内禁止端口与数据库字面量）；手写即第二份事实来源，
 * 且 Node 20 下 CJS 无法同步 require ESM 派生逻辑。JSON 是 PM2 原生支持格式，零模块系统问题。
 *
 * 用法：
 *   node scripts/pm2-config.mjs --env production    # 生成 ecosystem.config.json（缺省 production）
 *   pnpm pm2:config                                 # 等价别名（根 package.json）
 *
 * 输出（仓库根 ecosystem.config.json，不入库——含数据库口令与 JWT 密钥，禁止提交或跨机拷贝）：
 *   - 每应用一个进程：trillion-server / trillion-admin / trillion-geo
 *   - `cwd` 对齐各应用包目录（UPLOAD_DIR / SITES_OUTPUT_DIR 等相对路径以此为基准）
 *   - `script` 与上线器 `start:prod` 同口径（dist/main.js、.output/server/index.mjs）
 *   - `env` 为 `buildAppEnv()` 派生结果；守护参数防崩溃风暴（min_uptime / max_restarts / restart_delay）
 *
 * 生成后的常规操作（Linux 服务器，见 docs/spec/10-launch-runbook.md）：
 *   pm2 start ecosystem.config.json                                  # 首次拉起
 *   pm2 startOrReload ecosystem.config.json --update-env && pm2 save # 更新产物 / env 后重载
 *   pm2 startup systemd -u <用户> --hp /home/<用户>                  # 开机自启（按打印命令执行一次）
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { APP_NAMES, REPO_ROOT, buildAppEnv, findApp, loadConfig } from '../config/index.mjs'

/** 日志前缀（与启动器 / 上线器风格一致） */
const TAG = 'PM2 配置'

/** 输出文件（仓库根；已加入 .gitignore——含密钥，不入库、不跨机拷贝） */
const OUTPUT_FILE = 'ecosystem.config.json'

/** 各应用的生产产物相对路径（与上线器 hasBuildOutput 同口径：服务端 dist/main.js，Nuxt 应用 .output） */
const SCRIPT_PATH = {
  server: path.join('dist', 'main.js'),
  admin: path.join('.output', 'server', 'index.mjs'),
  geo: path.join('.output', 'server', 'index.mjs')
}

/** 进程名前缀：pm2 命令按名寻址（pm2 restart trillion-server 等） */
const NAME_PREFIX = 'trillion-'

/** 打印用法并退出 */
function usage() {
  console.log(
    [
      '用法：node scripts/pm2-config.mjs [--env <环境>]',
      '',
      '  --env    环境名，决定加载 env/.env.<环境> 并按其派生进程环境变量（缺省 production）',
      '',
      `输出：仓库根 ${OUTPUT_FILE}（含密钥：不入库、不跨机拷贝）`,
      '流程：node scripts/pm2-config.mjs --env production → pm2 start ecosystem.config.json → pm2 save'
    ].join('\n')
  )
}

/** 解析命令行：`--env <name>` / `--env=<name>` / `--help`；出现位置参数视为用法错误 */
function parseArgs(argv) {
  let appEnv
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
      usage()
      process.exit(0)
    }
    console.error(`[${TAG}] 无法识别的参数：${arg}（本命令只接受 --env 与 --help）`)
    process.exit(1)
  }
  return { appEnv }
}

/** 生成单个应用的 PM2 进程定义（env 值统一字符串化，避免 PM2 对数字/布尔的解析歧义） */
function buildAppProcess(config, name) {
  const app = findApp(name)
  const env = Object.fromEntries(Object.entries(buildAppEnv(config, name)).map(([key, value]) => [key, String(value)]))
  return {
    name: `${NAME_PREFIX}${name}`,
    cwd: path.join(REPO_ROOT, app.dir),
    script: path.join(REPO_ROOT, app.dir, SCRIPT_PATH[name]),
    exec_mode: 'fork',
    instances: 1,
    time: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    env
  }
}

async function main() {
  const { appEnv } = parseArgs(process.argv.slice(2))
  const config = loadConfig({ appEnv: appEnv ?? 'production' })

  const apps = APP_NAMES.map((name) => buildAppProcess(config, name))

  /** 产物缺失只警告不阻断：PM2 启动会失败，提前提示先跑 pnpm release --build-only */
  const missing = APP_NAMES.map((name) => buildAppProcess(config, name)).filter((app) => !fs.existsSync(app.script))
  for (const app of missing) {
    console.warn(
      `[${TAG}] 警告：${findApp(app.name.slice(NAME_PREFIX.length)).title} 产物缺失（${path.relative(REPO_ROOT, app.script)}），` +
        `先执行 pnpm release --env ${config.appEnv} --build-only 完成体检与构建`
    )
  }

  fs.writeFileSync(path.join(REPO_ROOT, OUTPUT_FILE), `${JSON.stringify({ apps }, null, 2)}\n`, 'utf8')

  console.log('─'.repeat(72))
  console.log(`[${TAG}] 已生成 ${OUTPUT_FILE}（环境 ${config.appEnv}，${path.relative(config.root, config.envFile)}）`)
  for (const name of APP_NAMES) {
    const app = buildAppProcess(config, name)
    console.log(
      `  ${app.name}  cwd=${path.relative(REPO_ROOT, app.cwd)}  script=${path.relative(REPO_ROOT, app.script)}  端口=${config.ports[name]}`
    )
  }
  console.log('─'.repeat(72))
  console.log(`[${TAG}] 安全提示：本文件含数据库口令与 JWT 密钥——已 gitignore，禁止提交或跨机拷贝`)
  console.log(`[${TAG}] 后续操作（见 docs/spec/10-launch-runbook.md）：`)
  console.log('  pm2 start ecosystem.config.json                                  # 首次拉起')
  console.log('  pm2 startOrReload ecosystem.config.json --update-env && pm2 save  # 更新产物 / env 后重载')
  console.log('  pm2 startup systemd -u <用户> --hp /home/<用户>                    # 开机自启（按打印命令执行一次）')
}

main().catch((error) => {
  console.error(`[${TAG}] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
