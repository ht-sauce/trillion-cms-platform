/**
 * 需求收集防滥用参数（已确认的初始阈值，见需求方案 §5.5.1）
 * 统一放服务端常量，不新增规则管理页面
 */

/** 图片验证码有效期（5 分钟） */
export const CAPTCHA_TTL_MS = 5 * 60 * 1000
/** 单个验证码最多允许错误次数，超过即作废 */
export const CAPTCHA_MAX_ATTEMPTS = 5

/** 验证码接口：60 秒内第 21 次起拒绝 */
export const CAPTCHA_WINDOW_MS = 60 * 1000
export const CAPTCHA_WINDOW_LIMIT = 20

/** 需求提交接口：60 秒内第 11 次起拒绝 */
export const SUBMIT_WINDOW_MS = 60 * 1000
export const SUBMIT_WINDOW_LIMIT = 10

/** 需求公开接口合计：60 秒内第 61 次起自动封禁 */
export const TOTAL_WINDOW_MS = 60 * 1000
export const TOTAL_WINDOW_LIMIT = 60

/** 猜验证码：10 分钟内第 20 次有效挑战错误答案自动封禁 */
export const WRONG_WINDOW_MS = 10 * 60 * 1000
export const WRONG_WINDOW_LIMIT = 20

/** 自动封禁时长（30 分钟） */
export const AUTO_BAN_MS = 30 * 60 * 1000
