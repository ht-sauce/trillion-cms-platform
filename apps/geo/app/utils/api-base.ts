/**
 * 服务端 API 基址读取（GEO 项目统一出口）
 *
 * 变量来源：根 `env/.env.<环境>` → 根 `config/index.mjs` 按服务端端口派生 → 启动器/构建脚本注入。
 * 项目内不再内置默认地址，缺失直接报错，避免请求打到错误的端口。
 */

/**
 * 回环主机名：API 基址指向它们时，按浏览器当前主机名自适应（见 ADR-021）。
 * 站点前缀规则（是否「本地多站点共用端口」）用同一份清单，唯一实现在
 * `@trillion/shared` 的 `utils/geo-url.ts`，不要在本工程内另立一份。
 */
import { LOOPBACK_HOSTS } from '@trillion/shared'

export { LOOPBACK_HOSTS }

/**
 * 局域网访问自适应
 *
 * 同局域网设备用本机 IP 打开站点时（如 http://192.168.1.5:3002），若继续用注入的 localhost 基址，
 * 客户端请求会打到访问者自己的机器；因此当基址指向回环地址、而页面不在回环地址时，改用页面主机名。
 * 说明：SSR 侧不经此转换（渲染进程与服务端同机，localhost 正确）；显式远端域名基址也不受影响。
 */
function adaptApiBase(apiBase: string): string {
  if (!import.meta.client) return apiBase
  const pageHost = window.location.hostname
  if (!pageHost || LOOPBACK_HOSTS.includes(pageHost)) return apiBase
  try {
    const url = new URL(apiBase)
    if (!LOOPBACK_HOSTS.includes(url.hostname)) return apiBase
    url.hostname = pageHost
    return url.toString().replace(/\/$/, '')
  } catch {
    return apiBase
  }
}

export function useApiBase(): string {
  const cfg = useRuntimeConfig()
  const apiBase = String(cfg.public.apiBase || '')
  if (!apiBase) {
    throw new Error(
      '缺少 API 基址：请通过 pnpm allDev / pnpm dev:geo 启动（SSG 构建请用 pnpm build:sites；变量由根 env/ 派生）'
    )
  }
  return adaptApiBase(apiBase)
}
