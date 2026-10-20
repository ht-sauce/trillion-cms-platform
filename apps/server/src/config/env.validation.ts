/**
 * 环境变量校验（zod）
 *
 * 启动即校验，缺配置直接报错，避免运行到一半才发现数据库连不上。
 * 注意：**端口与数据库不再有应用内默认值**，变量统一由仓库根 `env/.env.<环境>` 提供，
 * 经启动器（`pnpm allDev` / `pnpm dev:server`）注入进程；直接 `nest start` 会因缺变量启动失败。
 */
import { z } from 'zod'

export const envSchema = z.object({
  /** 运行环境（由启动器按 --env 注入） */
  NODE_ENV: z.enum(['development', 'test', 'production']),
  /** 监听端口：来自 config/ports.mjs，可由 env 文件的 PORT_SERVER 覆盖 */
  PORT: z.coerce.number().int().min(1).max(65535),
  DB_HOST: z.string().min(1, 'DB_HOST 不能为空'),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_USER: z.string().min(1, 'DB_USER 不能为空'),
  /** 允许为空串（无密码的本地库），但必须显式配置 */
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1, 'DB_NAME 不能为空'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET 长度至少 8 位，生产环境需 >= 32 位'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  UPLOAD_DIR: z.string().default('uploads'),
  PUBLIC_URL_PREFIX: z.string().default('/static'),
  /** 跨域白名单由 config/ 按 admin/geo 端口派生，逗号分隔 */
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS 不能为空'),
  /** GEO 项目基址（后台预览通道拼 iframe 地址用），由 config/ 派生 */
  GEO_BASE_URL: z.string().optional(),
  /** 内部接口令牌，由 config/ 从 JWT_SECRET 派生 */
  INTERNAL_API_TOKEN: z.string().optional(),
  /** 预览票据有效期（毫秒） */
  PREVIEW_TICKET_TTL_MS: z.string().optional()
})

export type EnvInput = z.infer<typeof envSchema>

/** 供 ConfigModule.forRoot({ validate }) 使用的校验函数 */
export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((item) => `  - ${item.path.join('.')}: ${item.message}`).join('\n')
    throw new Error(
      `环境变量校验失败：\n${issues}\n提示：请通过 pnpm allDev / pnpm dev:server 启动（环境变量统一放在根 env/ 目录）`
    )
  }
  return parsed.data as Record<string, unknown>
}
