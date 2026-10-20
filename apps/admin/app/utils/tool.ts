/**
 * 交互工具（**防抖**与 **loading** 是两个独立概念，不要混用）
 *
 * | 工具                     | 维度     | 解决的问题             | 职责                                     |
 * | ------------------------ | -------- | ---------------------- | ---------------------------------------- |
 * | `debounce` / `throttle`  | 时间维度 | 误触、连点、高频触发   | 决定"这次调用要不要放行"，只管时间窗口   |
 * | `useLoading`             | 状态维度 | 动作执行中的状态与互斥 | 只管"执行中"的标记与 `loading` 视觉反馈  |
 *
 * 一个按钮通常两者都要，**组合顺序固定：防抖在外、loading 在内**
 * ```ts
 * const { loading: saving, run } = useLoading()
 * const onSave = debounce(
 *   () => run(async () => { await api.save() }),
 *   DEBOUNCE_WAIT
 * )
 * ```
 * 模板：`<el-button :loading="saving" @click="onSave">保存</el-button>`
 *
 * 列表行级（只有被点的那一行显示 loading）：
 * ```ts
 * const { isLoading, runKeyed } = useLoading()
 * const onRemove = debounce((row) => runKeyed(`remove:${row.id}`, async () => { ... }), DEBOUNCE_WAIT)
 * ```
 * 模板：`<el-button :loading="isLoading(`remove:${row.id}`)" @click="onRemove(row)">删</el-button>`
 */
import { computed, ref, type Ref } from 'vue'

/** 按钮默认防抖窗口（ms）：足以吸收连点，又不会让用户明显感到"卡住" */
export const DEBOUNCE_WAIT = 400

export interface DebounceOptions {
  /** 时间窗口（ms），默认 `DEBOUNCE_WAIT` */
  wait?: number
  /**
   * 首次调用是否立即执行
   * - `true`（默认）：**先触发后防抖**——第一次立即执行，窗口内的重复调用被过滤
   * - `false`：经典尾随防抖——窗口结束后执行最后一次
   */
  leading?: boolean
  /** 窗口结束后是否补执行窗口内最后一次调用（默认 `false`，即多余的点击被丢弃） */
  trailing?: boolean
}

/**
 * 防抖：把时间窗口内的重复调用收敛为一次
 * 只处理"时机"，不关心被包装函数做了什么（异步、loading 由调用方自行组合）
 */
export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  options: number | DebounceOptions = {}
): (...args: A) => void {
  const resolved: Required<DebounceOptions> =
    typeof options === 'number'
      ? { wait: options, leading: true, trailing: false }
      : { wait: options.wait ?? DEBOUNCE_WAIT, leading: options.leading ?? true, trailing: options.trailing ?? false }

  let timer: ReturnType<typeof setTimeout> | null = null
  /** 窗口内最后一次调用的参数（`trailing` 时用于补执行） */
  let pendingArgs: A | null = null

  return (...args: A) => {
    /** 窗口内：本次调用被过滤 */
    if (timer) {
      pendingArgs = args
      return
    }

    if (resolved.leading) {
      fn(...args)
    } else {
      pendingArgs = args
    }

    timer = setTimeout(() => {
      timer = null
      if (resolved.trailing && pendingArgs) {
        const args_ = pendingArgs
        pendingArgs = null
        fn(...args_)
      } else {
        pendingArgs = null
      }
    }, resolved.wait)
  }
}

/**
 * 节流：窗口内最多执行一次（首次立即执行，窗口内后续调用直接丢弃、不延迟）
 * 与防抖的区别：节流会"均匀放行"，防抖是"窗口内只放第一次"
 */
export function throttle<A extends unknown[], R>(fn: (...args: A) => R, wait = DEBOUNCE_WAIT): (...args: A) => void {
  let last = 0
  return (...args: A) => {
    const now = Date.now()
    if (now - last < wait) return
    last = now
    fn(...args)
  }
}

export interface LoadingState {
  /** 是否有动作正在执行（绑定整块区域的 loading） */
  loading: Ref<boolean>
  /** 指定 key（或整体）是否正在执行（列表页按行绑定 loading） */
  isLoading: (key?: string | number) => boolean
  /** 执行动作：执行中重复调用被忽略（与按钮 loading 禁用互为兜底） */
  run: <T>(action: () => T | Promise<T>) => Promise<T | undefined>
  /** 按 key 执行动作：同一时刻仅一个动作在执行，`isLoading(key)` 只对当前 key 为真 */
  runKeyed: <T>(key: string | number, action: () => T | Promise<T>) => Promise<T | undefined>
}

/** 不区分 key 的动作使用固定标识 */
const BLOCK_KEY = '__block__'

/** loading 状态：只管"执行中"，不含任何时间窗口逻辑（防抖请用 `debounce`） */
export function useLoading(): LoadingState {
  /** 正在执行的动作标识；null 表示空闲 */
  const active = ref<string | number | null>(null)

  const loading = computed(() => active.value !== null)

  function isLoading(key?: string | number) {
    return key === undefined ? loading.value : active.value === key
  }

  async function execute<T>(key: string | number, action: () => T | Promise<T>): Promise<T | undefined> {
    /** 执行中：忽略重复触发 */
    if (active.value !== null) return undefined

    active.value = key
    try {
      return await action()
    } finally {
      active.value = null
    }
  }

  return {
    loading,
    isLoading,
    run: <T>(action: () => T | Promise<T>) => execute(BLOCK_KEY, action),
    runKeyed: <T>(key: string | number, action: () => T | Promise<T>) => execute(key, action)
  }
}
