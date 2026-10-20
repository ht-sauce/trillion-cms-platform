/**
 * SFC 编译 Worker（独立线程）
 *
 * 块代码的 parse/compileScript/compileTemplate/compileStyle 是同步 CPU 重活，
 * 在 NestJS 主进程执行会阻塞整个事件循环（保存块时所有在线请求一起停顿）。
 * 本文件作为 worker_threads 的入口：接收一次编译任务，返回校验结果。
 *
 * 协议：
 * - 收到 `{ code, filename }` → 执行 validateBlockSfc → 回传
 *   `{ ok: true, validation }` 或 `{ ok: false, message }`（协议/线程级异常）。
 * - 每个 Worker 只跑一次任务（用完即弃），避免状态残留与 OOM 连锁。
 *
 * 编译业务失败（SFC 语法错等）本身不抛异常，由 validateBlockSfc 归一为
 * `{ ok: false, errors }`，属于正常校验结果。
 */
import { parentPort } from 'node:worker_threads'
import { validateBlockSfc } from '../../modules/blocks/sfc'

const port = parentPort
if (!port) {
  process.exit(1)
}

interface SfcTask {
  code: string
  filename: string
}

port.on('message', async (task: SfcTask) => {
  try {
    const validation = await validateBlockSfc(task.code, task.filename)
    port.postMessage({ ok: true, validation })
  } catch (error) {
    port.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    })
  }
})
