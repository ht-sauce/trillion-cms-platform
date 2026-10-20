/**
 * 统一响应拦截器
 * 将控制器的返回值包装为 { code: 0, message: 'ok', data }。
 *
 * 两类响应**不包装**、原样透传：
 *   1. 二进制 / 流式响应（`StreamableFile`、`Buffer`、流）——站点下载 zip 走 `StreamableFile`，
 *      一旦被包装成 JSON，下载到的就不是 zip 而是一个描述对象的 JSON 文本
 *   2. 已经是 { code, data } 结构的响应（如静态文件接口自定义返回）
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common'
import { Observable, map } from 'rxjs'

/** 判断是否为不可 JSON 序列化的二进制 / 流式响应 */
function isBinaryResponse(value: unknown): boolean {
  return value instanceof StreamableFile || Buffer.isBuffer(value)
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (isBinaryResponse(value)) return value
        if (value && typeof value === 'object' && 'code' in value && 'data' in value) {
          return value
        }
        return { code: 0, message: 'ok', data: value ?? null }
      })
    )
  }
}
