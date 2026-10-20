/**
 * 服务端启动入口
 * 职责：设置中国时区、注册全局管道/拦截器/异常过滤器、静态文件服务、CORS、Swagger（仅非生产环境）
 * 注意：TZ 必须在使用任何 Date 之前设置
 */
process.env.TZ = process.env.TZ || 'Asia/Shanghai'

import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'node:path'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { buildDefaultAgents } from './config/ai-crawlers'
import { mpEncodeUrl } from './config/database-url'
import { formatDateTime } from './common/utils/datetime'
import * as fs from 'node:fs'

/**
 * 请求体上限（默认 100kb 装不下建站描述导入：一个 30+ 页面、每页若干块的整站 JSON 常在数百 KB）
 * 仅影响后台写接口（导入、块代码保存），前台只读接口不传大体。
 */
const JSON_BODY_LIMIT = '8mb'

/**
 * 统一时间出口：让所有 Date 在 JSON 序列化时输出为中国时区的 `YYYY-MM-DD HH:mm:ss`
 * （Prisma 对 MySQL DATETIME 按 UTC 读写，直接用默认 toJSON 会输出 UTC 的 ISO 串）
 */
Date.prototype.toJSON = function toJSON() {
  return formatDateTime(this)
}

/**
 * 若未提供 DATABASE_URL，则用 DB_* 变量自动拼装
 * 变量由仓库根 env/ 统一提供、启动器注入，缺失会被 env.validation.ts 拦截，故此处不再兜底默认值
 */
function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return
  const host = process.env.DB_HOST as string
  const port = process.env.DB_PORT as string
  const user = process.env.DB_USER as string
  const password = process.env.DB_PASSWORD ?? ''
  const name = process.env.DB_NAME as string
  process.env.DATABASE_URL = `mysql://${user}:${mpEncodeUrl(password)}@${host}:${port}/${name}`
}

/**
 * 进程级兜底：发布构建跑在子进程、SFC 编译跑在 worker 线程，
 * 任何漏网的异步异常都不允许拖垮服务进程——静态站点由 nginx 独立托管，
 * 服务进程必须保持后台与 API 可用。此处只记录、不退出；
 * 发布相关故障会体现在任务的 failed 状态与日志里。
 */
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection（已拦截，进程继续运行）:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException（已拦截，进程继续运行）:', error)
})

async function bootstrap() {
  ensureDatabaseUrl()

  const uploadDir = process.env.UPLOAD_DIR || 'uploads'
  fs.mkdirSync(join(process.cwd(), uploadDir), { recursive: true })

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false })

  /**
   * 请求体上限：默认 100kb 装不下「建站描述导入」这类整站 JSON（一个 30+ 页面、
   * 每页若干块的描述通常在数百 KB）。上限只对后台写接口生效，前台只读接口不受影响。
   */
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT })
  app.useBodyParser('urlencoded', { extended: true, limit: JSON_BODY_LIMIT })

  /** 跨域白名单由 config/ 按管理后台与 GEO 项目端口派生（见根 config/index.mjs） */
  const origins = (process.env.CORS_ORIGINS as string)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  app.enableCors({ origin: origins, credentials: true })

  app.setGlobalPrefix('geoserver')
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  // 本地静态文件：/static/xxx -> uploads/xxx（生产环境建议由 nginx 直接映射）
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: process.env.PUBLIC_URL_PREFIX || '/static' })

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Trillion CMS 服务端 API')
      .setDescription('多站点 CMS 平台数据层接口')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('geoserver/docs', app, SwaggerModule.createDocument(app, config))
  }

  // 启动时打印 AI 爬虫清单，便于运维确认 GEO 抓取策略
  console.log(`[bootstrap] 时区=${process.env.TZ} AI爬虫识别数=${buildDefaultAgents().length}`)

  /**
   * 端口来自启动器注入的环境变量（config/ports.mjs 为准），启动前已通过 zod 校验；
   * host 显式 0.0.0.0：本机开发时同局域网设备（手机 / 其他电脑）用本机 IP 也能访问接口（见 ADR-021），
   * 跨域来源由 config/ 派生的 CORS 白名单放行（已含本机局域网 IP）
   */
  await app.listen(Number(process.env.PORT), '0.0.0.0')
}

/** 启动阶段失败没有继续运行的意义（监听/DB 未就绪），记全日志后退出交给进程管理器重启 */
bootstrap().catch((error) => {
  console.error('[bootstrap] 服务启动失败:', error)
  process.exit(1)
})
