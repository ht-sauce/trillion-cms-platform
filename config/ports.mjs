/**
 * 端口表（全平台端口的唯一事实来源）
 *
 * 约定：
 * - 默认端口集中在本文件的 `PLATFORM_PORTS`，应用代码内不再出现端口字面量
 * - `env/.env.<环境>` 可用 `PORT_SERVER` / `PORT_ADMIN` / `PORT_GEO` 覆盖（例如测试环境换端口避免与开发环境冲突）
 * - 启动器（`scripts/dev.mjs`）把结果翻译成各进程的 `PORT`，并据此派生 API 基址与 CORS 白名单
 */

/** 各应用默认端口：服务端 3001 / 管理后台 3000 / GEO 项目 3002 */
export const PLATFORM_PORTS = Object.freeze({
  server: 3001,
  admin: 3000,
  geo: 3002
})

/** 环境变量中对应的键名（端口改名只需改这里） */
export const PORT_ENV_KEYS = Object.freeze({
  server: 'PORT_SERVER',
  admin: 'PORT_ADMIN',
  geo: 'PORT_GEO'
})

/**
 * 端口收窄：字符串/数字统一转为 1~65535 的整数
 * @param {unknown} value 环境变量原值
 * @param {number|undefined} fallback 缺省值（不传表示必填）
 * @param {string} label 报错用的变量名
 */
export function toPort(value, fallback, label) {
  const raw = value === undefined || value === null ? '' : String(value).trim()
  if (!raw) {
    if (fallback === undefined) throw new Error(`缺少端口配置：${label}`)
    return fallback
  }
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`端口配置非法：${label}=${raw}（应为 1~65535 的整数）`)
  }
  return port
}

/**
 * 解析各应用端口
 * @param {Record<string, string>} vars env 文件解析结果
 * @returns {{ server: number, admin: number, geo: number }}
 */
export function resolvePorts(vars = {}) {
  /** @type {Record<string, number>} */
  const ports = {}
  for (const name of Object.keys(PLATFORM_PORTS)) {
    ports[name] = toPort(vars[PORT_ENV_KEYS[name]], PLATFORM_PORTS[name], PORT_ENV_KEYS[name])
  }
  return ports
}
