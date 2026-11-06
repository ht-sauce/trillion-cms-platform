/**
 * 图片字符验证码服务（服务端生成、服务端校验、一次性使用）
 *
 * 不采用「浏览器自己生成答案再自己校验」的伪验证码；挑战保存在内存中，
 * 5 分钟有效，单挑战最多 5 次错误后作废。刷新挑战不会清空同 IP 的累计错误数
 * （累计错误由 RateLimitService 按 IP 统计）。
 */
import { Injectable } from '@nestjs/common'
import { randomInt, randomUUID } from 'node:crypto'
import { CAPTCHA_MAX_ATTEMPTS, CAPTCHA_TTL_MS } from './demands.constants'
import { normalizeIp } from '../../common/utils/ip'

/** 去除易混淆字符（I/O/0/1） */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface Challenge {
  code: string
  ip: string
  expiresAt: number
  attempts: number
}

export type CaptchaVerifyResult = 'ok' | 'missing' | 'expired' | 'wrong'

@Injectable()
export class CaptchaService {
  private readonly store = new Map<string, Challenge>()

  /** 生成新挑战：返回 id 与可直接用于 <img src> 的 SVG data URI */
  create(ip: string) {
    this.sweep()
    const code = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
    const id = randomUUID()
    this.store.set(id, { code, ip: normalizeIp(ip), expiresAt: Date.now() + CAPTCHA_TTL_MS, attempts: 0 })
    return {
      id,
      image: svgDataUri(code),
      expiresIn: Math.floor(CAPTCHA_TTL_MS / 1000)
    }
  }

  /** 校验并消耗挑战；错误时累计尝试次数，超过上限即作废 */
  verify(id: string | undefined, input: string | undefined, ip: string): CaptchaVerifyResult {
    if (!id) return 'missing'
    const challenge = this.store.get(id)
    if (!challenge || challenge.ip !== normalizeIp(ip)) return 'missing'
    if (challenge.expiresAt <= Date.now()) {
      this.store.delete(id)
      return 'expired'
    }

    const expected = challenge.code.toLowerCase()
    const actual = String(input || '')
      .trim()
      .toLowerCase()
    if (expected !== actual) {
      challenge.attempts += 1
      if (challenge.attempts >= CAPTCHA_MAX_ATTEMPTS) this.store.delete(id)
      return 'wrong'
    }

    return 'ok'
  }

  consume(id: string, ip: string) {
    if (this.store.get(id)?.ip === normalizeIp(ip)) this.store.delete(id)
  }

  /** 清理过期挑战，避免内存长期增长 */
  private sweep() {
    const now = Date.now()
    for (const [id, challenge] of this.store) {
      if (challenge.expiresAt <= now) this.store.delete(id)
    }
  }
}

/** 生成带干扰线与随机倾斜的字符 SVG */
function svgDataUri(code: string): string {
  const chars = [...code]
    .map((char, index) => {
      const x = 14 + index * 24
      const y = 26 + Math.floor(Math.random() * 6)
      const rotate = -18 + Math.floor(Math.random() * 36)
      const size = 22 + Math.floor(Math.random() * 6)
      return `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="700" fill="#1f2a44" transform="rotate(${rotate} ${x} ${y})">${char}</text>`
    })
    .join('')

  const lines = Array.from({ length: 4 }, () => {
    const x1 = Math.floor(Math.random() * 120)
    const y1 = Math.floor(Math.random() * 44)
    const x2 = Math.floor(Math.random() * 120)
    const y2 = Math.floor(Math.random() * 44)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa8c2" stroke-width="1" opacity="0.7"/>`
  }).join('')

  const dots = Array.from({ length: 20 }, () => {
    const cx = Math.floor(Math.random() * 120)
    const cy = Math.floor(Math.random() * 44)
    return `<circle cx="${cx}" cy="${cy}" r="1" fill="#7b87a3" opacity="0.6"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44" viewBox="0 0 120 44" role="img" aria-label="图片验证码"><rect width="120" height="44" fill="#f4f6fb"/>${lines}${dots}${chars}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
