/**
 * 全局配置工厂
 *
 * 服务端所有配置项统一放在本目录（src/config/），禁止散落到各模块硬编码。
 * 值的来源是仓库根 `env/.env.<环境>`（由根 config/ 派生后经启动器注入进程），
 * 因此**端口与数据库不再使用应用内默认值**：缺失会被 env.validation.ts 的 zod 校验在启动时拦截。
 */
import { buildDefaultAgents } from './ai-crawlers'

const configuration = () => {
  /** 路径类配置保留相对默认值（属发布产物目录约定，与端口/数据库无关） */
  const sitesOutputDir = process.env.SITES_OUTPUT_DIR || '../geo/sites'
  const geoProjectDir = process.env.GEO_PROJECT_DIR || '../geo'

  return {
    /** 运行环境 */
    env: process.env.NODE_ENV as string,
    /** 监听端口（env/.env.<环境> 的 PORT_SERVER，或 config/ports.mjs 默认值） */
    port: Number(process.env.PORT),
    /** 时区固定为中国时区，DATETIME 存储格式为 YYYY-MM-DD HH:mm:ss */
    timezone: 'Asia/Shanghai',
    database: {
      host: process.env.DB_HOST as string,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER as string,
      password: process.env.DB_PASSWORD ?? '',
      name: process.env.DB_NAME as string
    },
    jwt: {
      secret: process.env.JWT_SECRET as string,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    upload: {
      /** 物理存储目录（相对服务端根目录） */
      dir: process.env.UPLOAD_DIR || 'uploads',
      /** 对外 URL 前缀 */
      publicPrefix: process.env.PUBLIC_URL_PREFIX || '/static'
    },
    cors: {
      /** 由 config/ 按管理后台与 GEO 项目端口派生 */
      origins: (process.env.CORS_ORIGINS as string)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    },
    ai: {
      /** 默认放行的 AI 爬虫清单 */
      agents: buildDefaultAgents()
    },
    build: {
      /** GEO 项目根目录，用于触发增量 SSG */
      geoProjectDir,
      /** SSG 产物输出目录 */
      sitesOutputDir,
      /** 单次构建子进程的超时（毫秒）：超时即强杀并把发布任务判失败 */
      timeoutMs: Number(process.env.BUILD_TIMEOUT_MS) || 15 * 60 * 1000
    },
    /** 后台预览通道（09 §7.5）：iframe 指向 GEO 项目，票据短时效 */
    preview: {
      /** GEO 项目基址（由 config/ 按 PORT_GEO 派生后注入；缺省回退本地 3002 之外的保守值） */
      geoBaseUrl: process.env.GEO_BASE_URL || '',
      /** 预览票据有效期（毫秒），默认 30 分钟 */
      ticketTtlMs: Number(process.env.PREVIEW_TICKET_TTL_MS) || 30 * 60 * 1000
    },
    /** 内部接口令牌：构建脚本 / 渲染引擎中间件访问 /internal/* 时携带（见 config/index.mjs 派生规则） */
    internalToken: process.env.INTERNAL_API_TOKEN || ''
  }
}

export default configuration

/** 应用配置类型，注入 ConfigService<AppConfig> 使用 */
export type AppConfig = ReturnType<typeof configuration>
