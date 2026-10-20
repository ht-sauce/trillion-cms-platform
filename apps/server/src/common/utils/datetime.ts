/**
 * 时间格式化工具（中国时区）
 *
 * 说明：Prisma 对 MySQL DATETIME 统一按 UTC 读写（落库值是 UTC），
 * 本项目对外承诺的时间格式为 `2026-10-05 10:10:10` 且按中国时区展示，
 * 因此所有时间出口统一走这里，避免各处用 toISOString 造成 8 小时偏差。
 */

/** 中国时区固定偏移（毫秒），不依赖运行机器的本地时区设置 */
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

/** Date → `YYYY-MM-DD HH:mm:ss`（中国时区） */
export function formatDateTime(value: unknown): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

/** Date → `YYYY-MM-DD`（中国时区） */
export function formatDate(value: unknown): string | null {
  const text = formatDateTime(value)
  return text ? text.slice(0, 10) : null
}

/** 当前中国时区日期（`YYYY-MM-DD`）：「发布日期不能早于今天」这类业务校验的统一口径 */
export function todayInChina(): string {
  return formatDate(new Date()) ?? ''
}
