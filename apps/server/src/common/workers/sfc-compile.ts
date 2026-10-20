/**
 * SFC 编译入口（主线程侧）
 *
 * 把 create/save 块时的 Vue SFC 编译丢进 worker_threads 执行，
 * 保证 CPU 密集编译不阻塞 NestJS 主事件循环。策略：
 *
 * 1. Worker 可用 → 独立线程编译，带超时（默认 15s）；
 * 2. 超时 / Worker 崩溃 → 返回 `{ ok: false, error }`（上层转 400），
 *    **不**回退到主线程直接编译（那正是要避免的阻塞路径）；
 * 3. Worker 产物缺失（如直接 tsx 跑源码的开发场景）→ 降级为主线程
 *    直接编译并告警：功能可用优先于隔离。
 *
 * 设计取舍：编译产物（JS/CSS）不落库——发布端内容变更走"构建缓存 +
 * SSR 爬取"链路，不消费块的编译产物，落库只是死存储。
 * 保存路径另有 codeHash 短路（见 BlocksService.save）：同一份代码
 * 重复保存直接复用上次编译结果。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { BlockCompileResult } from '@trillion/shared'
import { validateBlockSfc } from '../../modules/blocks/sfc'

/** 单次编译的线程级超时（毫秒）：正常编译为几十~几百毫秒，超过即视为失控 */
const COMPILE_TIMEOUT_MS = 15_000

const WORKER_FILE = path.join(__dirname, 'sfc.worker.js')

/** 编译：优先 Worker 线程，产物缺失时降级主线程 */
export async function compileSfc(code: string, filename = 'Block.vue'): Promise<BlockCompileResult> {
  if (!fs.existsSync(WORKER_FILE)) {
    console.warn(`[sfc] 未找到 ${WORKER_FILE}（可能在未编译的源码环境运行），降级为主线程编译：${filename}`)
    return validateBlockSfc(code, filename)
  }
  return runInWorker(code, filename)
}

/** 在一次性 Worker 中执行编译任务 */
function runInWorker(code: string, filename: string): Promise<BlockCompileResult> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (result: BlockCompileResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const worker = new Worker(WORKER_FILE)

    const timer = setTimeout(() => {
      console.error(`[sfc] 编译超时（>${COMPILE_TIMEOUT_MS}ms）：${filename}`)
      settle({
        ok: false,
        error: { line: 1, column: 1, message: `编译超时（超过 ${COMPILE_TIMEOUT_MS / 1000} 秒）` }
      })
      void worker.terminate()
    }, COMPILE_TIMEOUT_MS)

    worker.on('message', (message: { ok: boolean; validation?: BlockCompileResult; message?: string }) => {
      if (message.ok && message.validation) {
        settle(message.validation)
      } else {
        settle({
          ok: false,
          error: { line: 1, column: 1, message: `编译线程异常：${message.message || '未知错误'}` }
        })
      }
      void worker.terminate()
    })

    worker.on('error', (error) => {
      console.error(`[sfc] 编译线程崩溃：${filename}`, error)
      settle({ ok: false, error: { line: 1, column: 1, message: `编译线程异常：${error.message}` } })
    })

    worker.on('exit', (exitCode) => {
      if (exitCode !== 0 && !settled) {
        settle({ ok: false, error: { line: 1, column: 1, message: `编译线程异常退出（exit=${exitCode}）` } })
      }
    })

    worker.postMessage({ code, filename })
  })
}
