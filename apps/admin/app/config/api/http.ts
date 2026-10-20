/**
 * 请求封装（管理后台唯一出口）
 * 所有页面不得自行调用 $fetch / axios，必须走 api/ 下模块 —— 统一 baseURL、统一 token 注入、统一错误提示
 */
import { LOOPBACK_HOSTS } from '@trillion/shared'
import { ElMessage } from 'element-plus'

/** 服务端统一响应结构 */
export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}

export interface Paged<T = unknown> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

const TOKEN_KEY = 'admin_token'

export function getToken(): string {
  return import.meta.client ? localStorage.getItem(TOKEN_KEY) || '' : ''
}

export function setToken(token: string) {
  if (import.meta.client) localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  if (import.meta.client) localStorage.removeItem(TOKEN_KEY)
}

/**
 * 回环主机名（`LOOPBACK_HOSTS`，取自 `@trillion/shared`，唯一实现在 `utils/geo-url.ts`）：
 * API 基址指向它们时按浏览器当前主机名自适应（见 ADR-021）；本文件不另立清单。
 * 0.0.0.0 也归入回环语义：它只对「监听」有意义，作为访问地址必然失败。
 */
/**
 * 局域网访问自适应
 *
 * 其他设备用本机 IP 打开后台时（如 http://192.168.1.5:3000），若继续用注入的 localhost 基址，
 * 请求会打到访问者自己的机器；因此当基址指向回环地址、而页面不在回环地址时，改用页面主机名。
 * 显式指向远端域名的 API 基址不受影响。
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

/**
 * 取服务端 API 基址
 * 变量由根 env/ 与 config/ 派生、启动器注入；缺失即报错，避免请求打到错误的地址
 */
function baseUrl(): string {
  const cfg = useRuntimeConfig()
  const apiBase = String(cfg.public.apiBase || '')
  if (!apiBase) {
    throw new Error('缺少 API 基址：请通过 pnpm allDev / pnpm dev:admin 启动（NUXT_PUBLIC_API_BASE 由根 env/ 派生）')
  }
  return adaptApiBase(apiBase)
}

/**
 * 取统一 API 基址（含局域网自适应）
 * 供不走 `request()` 的特殊请求使用（如产物 zip 下载是二进制流而非统一响应结构）
 */
export function resolveApiBase(): string {
  return baseUrl()
}

/**
 * 由相对 publicUrl（/static/...）拼出可直接访问的绝对地址
 * 静态文件挂服务端根路径（不带 /geoserver 前缀），而后台页面在 admin 源下，
 * 直接以相对路径作 img src 会解析到后台自身端口导致 404
 */
export function resolveFileUrl(publicUrl: string): string {
  if (/^https?:\/\//i.test(publicUrl)) return publicUrl
  const origin = new URL(resolveApiBase()).origin
  return `${origin}${publicUrl.startsWith('/') ? '' : '/'}${publicUrl}`
}

/**
 * 当前页面路由路径（剥离 app.baseURL 前缀）
 * 后台挂在 /geocms/ 基础路径下，location.pathname 会带前缀（如 /geocms/login），
 * 对路由路径做判断（登录页判定等）必须先剥离，否则 401 跳转逻辑失灵
 */
export function currentRoutePath(): string {
  const base = String(useRuntimeConfig().app?.baseURL || '/')
  const pathname = window.location.pathname
  return base !== '/' && pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
}

/**
 * 统一请求方法
 * @param path 相对 API 基址的路径，如 /sites
 * @param options 请求配置
 */
export async function request<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {})
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const result = await $fetch<ApiResult<T>>(`${baseUrl()}${path}`, {
      ...options,
      headers
    } as never)

    if (result.code !== 0) {
      ElMessage.error(result.message || '请求失败')
      throw new Error(result.message || '请求失败')
    }
    return result.data
  } catch (error: unknown) {
    const err = error as { statusCode?: number; data?: ApiResult; message?: string }
    if (err?.statusCode === 401) {
      clearToken()
      if (import.meta.client && !currentRoutePath().startsWith('/login')) {
        navigateTo('/login')
      }
      throw error
    }
    const message = err?.data?.message || err?.message || '网络异常'
    ElMessage.error(message)
    throw error
  }
}

/** GET 便捷方法 */
export function get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
  return request<T>(path, { method: 'GET', query })
}

/** POST 便捷方法 */
export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body as never })
}

/** PATCH 便捷方法 */
export function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: body as never })
}

/** PUT 便捷方法（全量覆盖式保存，如角色菜单授权） */
export function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body as never })
}

/** DELETE 便捷方法 */
export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

/** 带文件的上传请求（multipart/form-data） */
export function upload<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: formData })
}
