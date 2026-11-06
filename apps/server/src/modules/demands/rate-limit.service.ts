/**
 * 需求公开接口的内存滑动窗口计数
 *
 * 只统计需求表单相关接口（验证码 / 提交），普通页面、静态文件与爬虫访问不纳入。
 * 进程内计数用于限流与「猜验证码」累计；封禁名单另存数据库，重启后仍生效。
 */
import { Injectable } from '@nestjs/common'

export type WindowKind = 'captcha' | 'submit' | 'total' | 'wrong'

interface IpState {
  captcha: number[]
  submit: number[]
  total: number[]
  wrong: number[]
}

@Injectable()
export class RateLimitService {
  private readonly store = new Map<string, IpState>()
  private readonly pending = new Map<string, Promise<void>>()

  async exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) || Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pending.set(key, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (this.pending.get(key) === current) this.pending.delete(key)
    }
  }

  /** 记录一次请求并返回窗口内计数（含本次） */
  hit(ip: string, kind: WindowKind, windowMs: number): number {
    const state = this.stateOf(ip)
    const now = Date.now()
    state[kind] = state[kind].filter((ts) => now - ts < windowMs)
    state[kind].push(now)
    return state[kind].length
  }

  /** 只读窗口内计数 */
  count(ip: string, kind: WindowKind, windowMs: number): number {
    const state = this.store.get(ip)
    if (!state) return 0
    const now = Date.now()
    state[kind] = state[kind].filter((ts) => now - ts < windowMs)
    return state[kind].length
  }

  /** 解禁或自动封禁到期后清理计数，避免旧计数立即再次触发封禁 */
  reset(ip: string) {
    this.store.delete(ip)
  }

  private stateOf(ip: string): IpState {
    const existing = this.store.get(ip)
    if (existing) return existing
    const state: IpState = { captcha: [], submit: [], total: [], wrong: [] }
    this.store.set(ip, state)
    return state
  }
}
