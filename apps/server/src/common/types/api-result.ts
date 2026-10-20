/**
 * 统一响应结构
 * 所有成功响应统一包装为 { code, message, data }，前端无需分歧处理
 */
export interface ApiResultShape<T> {
  code: number
  message: string
  data: T
}

export function ok<T>(data: T, message = 'ok'): ApiResultShape<T> {
  return { code: 0, message, data }
}
