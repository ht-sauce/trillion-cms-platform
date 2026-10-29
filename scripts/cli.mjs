#!/usr/bin/env node
/**
 * 根命令公共工具（`build.mjs` / `db.mjs` / `site.mjs` 共用）
 *
 * 为什么需要它：根 `package.json` 的脚本已收敛为 8 条（`dev` / `build` / `db` / `site` /
 * `release` / `bundle` / `lint` / `format`，决策见 ADR-044），应用、环境、动作全部改为参数。
 * 于是三个分发脚本都要做同一件事：**剥离 `--env` → 按环境注入变量 → 执行真正的子命令**。
 * 这份逻辑只写一遍，避免三处各写一套、日后修一处漏两处。
 *
 * 边界：本文件只管「解析与执行」，不含任何业务判断（构建顺序、子命令清单由各分发脚本自己声明）。
 */
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { REPO_ROOT } from '../config/index.mjs'
import { spawnPnpm } from './pnpm.mjs'

/**
 * 剥离 `--env <名>` / `--env=<名>`，返回环境名与剩余参数
 *
 * 为什么必须剥离：剩余参数要原样转给下游脚本（`prisma migrate dev`、`build-sites.mjs`），
 * 而它们不认识 `--env` —— 带下去会被当成各自的业务选项直接报错。
 * 环境本身仍由调用方 `loadConfig({ appEnv })` 生效，不会丢。
 * @param {string[]} argv 命令行参数（不含 node 与脚本路径）
 * @returns {{ appEnv: string | undefined, rest: string[] }}
 */
export function takeEnv(argv) {
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
    rest.push(arg)
  }
  return { appEnv, rest }
}

/**
 * 执行 pnpm（日志直接继承到当前终端），等待结束后返回退出码
 * @param {string[]} args pnpm 参数（如 ['--filter', '@trillion/server', 'build']）
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<number>}
 */
export function runPnpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnPnpm(args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...options.env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/**
 * 执行仓库内某个 node 脚本（参数原样透传、日志继承），等待结束后返回退出码
 *
 * 用 `process.execPath` 而不是字面量 `node`：PATH 里没有 node 时（部分 Windows 终端、
 * 精简容器）也能跑起来，且保证与当前进程同一个 Node 版本。
 * @param {string} scriptRelativePath 相对仓库根的脚本路径（如 'scripts/db-release.mjs'）
 * @param {string[]} args
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<number>}
 */
export function runNode(scriptRelativePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, scriptRelativePath), ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...options.env },
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

/**
 * 执行一步并以其退出码结束本进程（分发脚本的收尾统一走这里）
 * @param {Promise<number>} promise runPnpm / runNode 的返回值
 */
export async function exitWith(promise) {
  process.exit(await promise)
}

/** 打印用法后以非零码退出（参数写错的统一出口） */
export function usageError(lines) {
  console.error(lines.join('\n'))
  process.exit(1)
}
