/**
 * 环境变量文件解析（仓库根 `env/` 目录）
 *
 * 职责边界：只负责「运行环境名 → env/.env.<环境> → 键值对」与必填校验，
 * 不做任何派生计算（派生逻辑统一在 `config/index.mjs`）。
 * 这样各工程无需再自带 `.env`，避免多份事实来源。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

/** 支持的运行环境（决定加载 env/.env.<名字>） */
export const APP_ENVS = ['development', 'test', 'production']

/** 环境变量目录名（仓库根，与 apps/ 同级） */
export const ENV_DIR = 'env'

/**
 * 解析目标运行环境：`--env <name>` 优先，其次进程变量 `APP_ENV`，默认 development
 * @param {string[]} argv 命令行参数（不含 node 与脚本路径）
 * @param {Record<string, string|undefined>} baseEnv 兜底环境变量
 */
export function resolveAppEnv(argv = [], baseEnv = process.env) {
  let fromArgv
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env') {
      fromArgv = argv[index + 1]
      break
    }
    if (arg.startsWith('--env=')) {
      fromArgv = arg.slice('--env='.length)
      break
    }
  }
  return String(fromArgv || baseEnv.APP_ENV || 'development').trim()
}

/**
 * 极简 .env 解析：支持 `#` 注释、空行、`export ` 前缀、单/双引号包裹
 * @param {string} text 文件内容
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const vars = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const matched = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!matched) continue
    const key = matched[1]
    let value = matched[2].trim()
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)
    vars[key] = value
  }
  return vars
}

/**
 * 读取 `env/.env.<环境>`；文件缺失直接报错并给出修复命令（配置缺失即失败，不静默兜底）
 * @param {string} root 仓库根目录
 * @param {string} appEnv 运行环境名
 */
export function loadEnvFile(root, appEnv) {
  const filePath = path.join(root, ENV_DIR, `.env.${appEnv}`)
  if (!fs.existsSync(filePath)) {
    const relative = path.join(ENV_DIR, `.env.${appEnv}`)
    throw new Error(
      [
        `未找到环境变量文件：${relative}`,
        `请从模板创建：copy ${path.join(ENV_DIR, '.env.example')} ${relative}`,
        '所有环境变量统一维护在仓库根 env/ 目录（见 docs/spec/07-deployment.md §3）'
      ].join('\n')
    )
  }
  return { filePath, vars: parseEnv(fs.readFileSync(filePath, 'utf8')) }
}

/**
 * 必填变量校验：键必须存在且非空（空值视为未配置）
 * @param {Record<string, string>} vars
 * @param {string[]} keys
 * @param {string} filePath 报错定位用
 */
export function assertVars(vars, keys, filePath) {
  const missing = keys.filter((key) => !String(vars[key] ?? '').trim())
  if (missing.length) {
    throw new Error(`环境变量缺失（${path.basename(filePath)}）：${missing.join(', ')}`)
  }
}
