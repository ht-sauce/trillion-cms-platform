/**
 * JWT 有效期类型转换工具
 * jsonwebtoken 的 expiresIn 类型为 `StringValue | number`（StringValue 来自 ms），
 * 配置文件里读到的是普通 string，这里做一次集中收窄，避免各处重复断言
 */
import type { JwtSignOptions } from '@nestjs/jwt'

type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>

/** 默认有效期：7 天 */
export const DEFAULT_JWT_EXPIRES_IN = '7d'

/** 把配置字符串（如 7d / 12h / 3600）转为 JWT 可接受的 expiresIn 类型 */
export function jwtExpiresIn(value?: string): JwtExpiresIn {
  return (value || DEFAULT_JWT_EXPIRES_IN) as JwtExpiresIn
}
