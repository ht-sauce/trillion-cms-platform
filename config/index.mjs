/**
 * 全局配置出口（唯一入口）
 *
 * 设计：
 * - `env/` 只放「各环境的变量值」，`config/` 只放「结构化配置与派生逻辑」
 * - 端口、API 基址、CORS 白名单、数据库连接串全部由本文件派生，应用代码不再硬编码
 * - 消费方：`scripts/dev.mjs`（本地启动器）、`scripts/exec.mjs`（包脚本执行器）
 *
 * 用法：
 *   const config = loadConfig()                 // 默认 development
 *   const env = buildAppEnv(config, 'server')   // 组装某应用进程的环境变量
 */
import { networkInterfaces } from 'node:os'
import { createHash } from 'node:crypto'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPS, APP_NAMES, SHARED_PACKAGE, findApp } from './apps.mjs'
import { APP_ENVS, ENV_DIR, assertVars, loadEnvFile, parseEnv, resolveAppEnv } from './env.mjs'
import { PLATFORM_PORTS, PORT_ENV_KEYS, resolvePorts, toPort } from './ports.mjs'

/** 仓库根目录（本文件位于 <root>/config/ 下） */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

export {
  APPS,
  APP_NAMES,
  APP_ENVS,
  ENV_DIR,
  PLATFORM_PORTS,
  PORT_ENV_KEYS,
  SHARED_PACKAGE,
  findApp,
  parseEnv,
  resolveAppEnv
}

/** 环境变量文件中必须提供的键（端口/API 基址等其余项均可派生或有默认值） */
const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET']

/** 去掉末尾斜杠，避免拼出 `//geoserver` */
function trimSlash(value) {
  return String(value).replace(/\/+$/, '')
}

/**
 * 由 JWT_SECRET 派生内部接口令牌（未显式配置 INTERNAL_API_TOKEN 时使用）
 * 同一份 env 派生出的服务端与构建脚本会得到相同令牌，无需额外维护一份密钥。
 * @param {string|undefined} secret
 */
function deriveInternalToken(secret) {
  return createHash('sha256')
    .update(`internal:${secret || 'trillion'}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * 探测本机 IPv4 地址（用于打印局域网访问入口、派生 CORS 白名单）
 *
 * 刻意与 Vite 的地址探测保持一致（`resolveServerUrls`：遍历 `os.networkInterfaces()`，
 * 只筛 IPv4、跳过回环，其余全量返回），不做优先级排序、不区分物理/虚拟网卡——
 * 这类"猜哪个地址更像局域网"的判断容易误判（地址段不标准、WSL / Docker 网卡混杂），
 * 多地址时全量列出交由使用者挑选即可。
 * @returns {string[]} 地址列表（已去重），未联网时为空数组
 */
export function detectLanHosts() {
  const hosts = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      /** family 在 Node 18+ 是字符串 'IPv4'，更早版本是数字 4，两种都兼容 */
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      if (entry.internal) continue
      hosts.push(entry.address)
    }
  }
  /** 同一地址可能出现在多张网卡上，按地址去重 */
  return [...new Set(hosts)]
}

/**
 * 加载全局配置
 * @param {{ appEnv?: string, argv?: string[], root?: string, baseEnv?: Record<string, string|undefined> }} [options]
 */
export function loadConfig(options = {}) {
  const root = options.root || REPO_ROOT
  const appEnv = String(options.appEnv || resolveAppEnv(options.argv || [], options.baseEnv || process.env)).trim()

  if (!APP_ENVS.includes(appEnv)) {
    throw new Error(`不支持的运行环境：${appEnv}（可选：${APP_ENVS.join(' / ')}）`)
  }

  const { filePath, vars } = loadEnvFile(root, appEnv)
  assertVars(vars, REQUIRED_VARS, filePath)

  const ports = resolvePorts(vars)
  const host = vars.PUBLIC_HOST || 'localhost'
  const timezone = vars.TZ || 'Asia/Shanghai'
  /** 本机局域网 IPv4（按常见程度排序）：用于打印局域网访问入口、放行同网段设备的跨域请求 */
  const lanHosts = detectLanHosts()

  /**
   * API 基址：显式 API_BASE 优先，否则按服务端端口派生绝对基址（含 /geoserver 全局前缀）。
   * 必须是绝对地址：构建脚本（build-sites/sync-blocks）、nitro /static 代理、preview 等
   * 服务端消费者不做同源改写；浏览器端（admin/geo）跨端口直连也依赖绝对基址 + CORS 白名单。
   */
  const apiBase = trimSlash(vars.API_BASE || `http://${host}:${ports.server}/geoserver`)

  /**
   * CORS 白名单：显式 CORS_ORIGINS 优先，否则由 admin/geo 端口派生。
   * 同时放行本机局域网 IP 的 origin：同网段设备用 IP 打开前端时（详见 ADR-021），
   * 其请求来源是 `http://<局域网IP>:<端口>`，不放行会被浏览器拦在预检阶段。
   */
  const corsOrigins =
    vars.CORS_ORIGINS ||
    [host, ...lanHosts]
      .flatMap((item) => [ports.admin, ports.geo].filter(Boolean).map((port) => `http://${item}:${port}`))
      .join(',')

  const database = {
    host: vars.DB_HOST,
    port: toPort(vars.DB_PORT, 3306, 'DB_PORT'),
    user: vars.DB_USER,
    password: vars.DB_PASSWORD ?? '',
    name: vars.DB_NAME
  }
  /** Prisma 只接受单一连接串：显式 DATABASE_URL 优先，否则由 DB_* 拼装（账号密码做百分号编码） */
  database.url =
    vars.DATABASE_URL ||
    `mysql://${encodeURIComponent(database.user)}:${encodeURIComponent(database.password)}@${database.host}:${database.port}/${database.name}`

  /** 生产环境密钥强度提醒（不阻断启动，由人工确认） */
  if (appEnv === 'production' && String(vars.JWT_SECRET).length < 32) {
    console.warn(
      `[config] 警告：production 环境的 JWT_SECRET 建议使用 32 位以上随机串（当前 ${String(vars.JWT_SECRET).length} 位）`
    )
  }

  return {
    root,
    appEnv,
    /** 传给子进程的 NODE_ENV：与运行环境同名（development / test / production） */
    nodeEnv: appEnv,
    timezone,
    ports,
    database,
    corsOrigins,
    /** 本机局域网 IPv4 列表（未联网为空数组），启动器据此打印「局域网访问」入口 */
    lanHosts,
    urls: {
      host,
      apiBase,
      admin: `http://${host}:${ports.admin}`,
      geo: `http://${host}:${ports.geo}`,
      server: `http://${host}:${ports.server}`
    },
    envFile: filePath,
    vars
  }
}

/**
 * 组装某应用进程所需的环境变量：env 文件全量 + 派生值 + 该应用专属端口
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string} appName 应用短名（server / admin / geo）
 */
export function buildAppEnv(config, appName) {
  const app = findApp(appName)
  return {
    /**
     * 先继承当前进程的系统环境（PATH / ComSpec / HOME 等）：
     * Node spawn 的 env 是子进程「完整环境」而非增量——缺 PATH 时 Linux 下 CLI 的
     * shebang（#!/usr/bin/env node）解析会直接 ENOENT（pnpm run 报
     * ERR_PNPM_EXECUTOR_RUN_SCRIPT_SPAWN），Windows 因 .cmd 走文件关联不查 PATH 而掩盖此坑。
     * 业务派生值在后覆盖同名变量（PORT / NODE_ENV / TZ 等以派生为准）。
     */
    ...process.env,
    ...config.vars,
    APP_ENV: config.appEnv,
    NODE_ENV: config.nodeEnv,
    TZ: config.timezone,
    /** 各应用自己的监听端口（Nuxt 亦可由启动参数 --port 覆盖） */
    PORT: String(config.ports[appName]),
    DB_HOST: config.database.host,
    DB_PORT: String(config.database.port),
    DB_USER: config.database.user,
    DB_PASSWORD: config.database.password,
    DB_NAME: config.database.name,
    DATABASE_URL: config.database.url,
    CORS_ORIGINS: config.corsOrigins,
    /** 前端与管理后台共用的 API 基址（SSG 构建脚本也依赖它） */
    NUXT_PUBLIC_API_BASE: config.urls.apiBase,
    /**
     * GEO 项目（站点渲染引擎）基址：预览通道拼 iframe 地址、SSG 产物自检用。
     * 允许 env 文件显式覆盖派生值——线上站点由 nginx 直出静态产物、预览经对外入口
     * 分流到 GEO，派生缺省值指向 GEO 的**内部监听端口**，浏览器打不开 iframe。
     */
    GEO_BASE_URL: config.vars.GEO_BASE_URL || config.urls.geo,
    /** 对外主机名：预览地址与绝对 URL 派生用 */
    PUBLIC_HOST: config.urls.host,
    /**
     * 内部接口令牌：服务端与 GEO 项目（构建脚本 / 渲染引擎中间件）之间的共享密钥。
     * 未显式配置时由 JWT_SECRET 派生——避免开发环境出现「无令牌即放行」的裸奔分支，
     * 同时让 `pnpm allDev` 开箱可用（两端由同一份 config/ 派生，天然一致）。
     */
    INTERNAL_API_TOKEN: config.vars.INTERNAL_API_TOKEN || deriveInternalToken(config.vars.JWT_SECRET),
    APP_DIR: path.join(config.root, app.dir)
  }
}

/**
 * 生成启动摘要（启动器打印用）
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string[]} appNames 本次启动的应用
 */
export function describeConfig(config, appNames) {
  return [
    `运行环境  ${config.appEnv}（${path.relative(config.root, config.envFile)}）`,
    `数据库    ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
    `API 基址  ${config.urls.apiBase}`,
    /** 本机 IP 在启动摘要里也列一次：入口清单可能在后续日志滚动后不易回看 */
    `局域网 IP ${config.lanHosts.length ? config.lanHosts.join(' / ') : '未检测到（未联网或无可用网卡）'}`,
    `启动应用  ${appNames.map((name) => `${name}:${config.ports[name]}`).join('  ')}`
  ]
}

/**
 * 生成「访问入口」清单（启动器在工程全部拉起后打印，免去记忆端口）
 *
 * 每个应用给出主入口，顺带列出常用子路径（管理后台登录页、服务端 Swagger 文档）。
 * @param {ReturnType<typeof loadConfig>} config
 * @param {string[]} appNames 本次启动的应用
 * @param {Record<string, number>} [portOverrides] 实际监听端口（Nuxt 端口回退时由启动器传入，用于修正 URL）
 * @param {{ lan?: boolean, docs?: boolean }} [options]
 *        `lan` 是否输出局域网访问段落（开发形态需要，上线器传 false）；
 *        `docs` 是否输出 Swagger 入口，缺省按运行环境判定（服务端生产环境关闭 Swagger，与 main.ts 同口径）
 * @returns {string[]} 逐行文本（不含 ANSI 颜色，由调用方决定排版）
 */
export function describeEndpoints(config, appNames, portOverrides = {}, options = {}) {
  /** 应用实际访问端口：以实际监听端口为准（Nuxt 端口回退时由启动器传入） */
  const portOf = (name) => portOverrides[name] || config.ports[name]
  /**
   * API 基址在入口清单里的展示形态：
   * - 默认（按服务端端口派生的绝对基址，含 /geoserver 前缀）→ 跟随目标主机切换
   * - 显式 API_BASE 指向远端域名 → 原样展示
   */
  const apiBaseFollowsHost = config.urls.apiBase.startsWith(config.urls.server)
  const apiBaseFor = (targetHost) =>
    apiBaseFollowsHost
      ? config.urls.apiBase.replace(/^https?:\/\/[^/]+/, `http://${targetHost}:${portOf('server')}`)
      : config.urls.apiBase.startsWith('/')
        ? `http://${targetHost}:${portOf('server')}${config.urls.apiBase}`
        : config.urls.apiBase

  /** 各应用在指定主机下的主入口（本机清单与局域网清单共用）；admin 挂 /geocms/ 基础路径 */
  const primaryUrl = (name, targetHost) =>
    ({
      server: `http://${targetHost}:${portOf('server')}/geoserver`,
      admin: `http://${targetHost}:${portOf('admin')}/geocms/`,
      geo: `http://${targetHost}:${portOf('geo')}/`
    })[name]

  /** Swagger 仅非生产环境启用（与 `apps/server/src/main.ts` 同口径），生产清单不再给出该入口 */
  const withDocs = options.docs === undefined ? config.appEnv !== 'production' : options.docs

  /** 按主机名生成各应用入口：应用 → [入口名, 地址][]，顺序即打印顺序 */
  const buildEndpoints = (targetHost) => ({
    server: [
      ['接口基址', primaryUrl('server', targetHost)],
      ['健康检查', `${apiBaseFor(targetHost)}/health`],
      ...(withDocs ? [['Swagger 文档', `${apiBaseFor(targetHost)}/docs`]] : [])
    ],
    admin: [
      ['后台入口', primaryUrl('admin', targetHost)],
      ['登录页', `${primaryUrl('admin', targetHost)}login`]
    ],
    geo: [['站点入口', primaryUrl('geo', targetHost)]]
  })

  /** 标题列宽度：按最长显示宽度对齐（中文标题占两列，不能用 String.padEnd 直接补） */
  const titleWidth = Math.max(...appNames.map((name) => displayWidth(findApp(name).title)))

  /** 把入口表渲染成逐行文本 */
  const render = (endpoints) => {
    const rows = []
    for (const name of appNames) {
      const title = findApp(name).title
      for (const [index, [label, url]] of (endpoints[name] || []).entries()) {
        const head =
          index === 0
            ? `  · ${title}${' '.repeat(titleWidth - displayWidth(title) + 1)}`
            : `    ${' '.repeat(titleWidth + 1)}`
        rows.push(`${head}${url}   ${label}`)
      }
    }
    return rows
  }

  const lines = ['访问入口（按住 Ctrl 点击可直接打开）', ...render(buildEndpoints(config.urls.host))]

  /** 上线形态（release.mjs）传 `lan: false`：生产对外访问由 nginx / 域名决定，局域网段落无意义 */
  if (options.lan === false) return lines

  /**
   * 局域网入口：同网段设备（手机 / 其他电脑）改用本机 IP 访问（见 ADR-021）。
   *
   * 每个应用一行、列出探测到的全部地址（与 Vite 打印 Network 地址的做法一致），
   * 只给主入口 —— 多网卡时不会成倍刷屏；探测不到地址时留一行说明，不静默略过。
   */
  const lanHosts = config.lanHosts || []
  if (lanHosts.length) {
    lines.push('', '局域网访问（同网段设备用；多张网卡时逐行列全）')
    for (const name of appNames) {
      const title = findApp(name).title
      const urls = lanHosts.map((host) => primaryUrl(name, host)).join('   ')
      lines.push(`  · ${title}${' '.repeat(titleWidth - displayWidth(title) + 1)}${urls}`)
    }
  } else {
    lines.push('', '局域网访问  未检测到本机 IPv4（未联网或无可用网卡），以上本机入口不受影响')
  }
  return lines
}

/** 估算终端显示宽度：CJK/全角字符按 2 列计（仅用于启动终端里的对齐排版） */
function displayWidth(text) {
  const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/
  let width = 0
  for (const char of String(text)) width += WIDE.test(char) ? 2 : 1
  return width
}
