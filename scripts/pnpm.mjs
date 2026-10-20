/**
 * pnpm 调用封装（启动器与执行器共用）
 *
 * 目的：跨平台定位 pnpm 可执行入口。
 * - 由 pnpm 自身启动时优先使用 `npm_execpath`（可能是 pnpm.exe 或 pnpm.cjs），可直接 spawn；
 *   其中 .js/.cjs/.mjs 需用 node 执行，避免 Windows 下 .cmd 必须 shell 拼接导致的告警
 * - 无 `npm_execpath`（直接 `node scripts/dev.mjs`）时回退 `pnpm`（Windows 为 pnpm.cmd，需 shell）
 */
import { spawn } from 'node:child_process'

const IS_WIN = process.platform === 'win32'

/** 解析 pnpm 启动方式 → { command, prefix, shell } */
function resolvePnpm() {
  const entry = process.env.npm_execpath
  if (entry && /\.(cjs|mjs|js)$/i.test(entry)) {
    return { command: process.execPath, prefix: [entry], shell: false }
  }
  if (entry) {
    return { command: entry, prefix: [], shell: false }
  }
  const command = IS_WIN ? 'pnpm.cmd' : 'pnpm'
  return { command, prefix: [], shell: /\.cmd$/i.test(command) }
}

/**
 * 执行 pnpm 命令
 * @param {string[]} args pnpm 参数（如 ['--filter', '@trillion/server', 'dev']）
 * @param {import('node:child_process').SpawnOptions} options spawn 选项
 */
export function spawnPnpm(args, options = {}) {
  const { command, prefix, shell } = resolvePnpm()
  return spawn(command, [...prefix, ...args], { ...options, shell })
}
