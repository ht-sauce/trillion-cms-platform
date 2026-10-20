/**
 * Prisma JSON 字段写入/读取的类型收窄工具
 * Prisma 的 Json 字段入参类型为 `JsonNull | InputJsonValue`，普通业务对象
 * （如 ThemeConfig / RobotsPolicy / BlockData）缺少索引签名，无法直接赋值，
 * 统一在此做一次集中转换，避免各处散落断言
 */
import type { Prisma } from '@prisma/client'

/** 业务对象 → Prisma JSON 入参 */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

/** Prisma JSON 出参 → 普通对象（空值时回退默认值） */
export function fromJson<T>(value: unknown, fallback: T): T {
  return (value == null ? fallback : value) as T
}
