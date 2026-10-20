/**
 * 站点会员鉴权服务（JWT-M）
 * 会员必须在自己注册的站点内登录——A 站会员在 B 站无效
 */
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'

export interface MemberPayload {
  sub: string
  siteId: string
  username: string
}

@Injectable()
export class SiteAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  /** 会员注册 */
  async register(siteId: string, username: string, password: string, nickname?: string) {
    const exists = await this.prisma.member.findFirst({ where: { siteId, username } })
    if (exists) throw new UnauthorizedException('该账号在本站点已注册')

    const member = await this.prisma.member.create({
      data: { siteId, username, nickname, password: await bcrypt.hash(password, 10) }
    })
    return { id: member.id, username: member.username, nickname: member.nickname }
  }

  /** 会员登录：返回 JWT-M */
  async login(siteId: string, username: string, password: string) {
    const member = await this.prisma.member.findFirst({ where: { siteId, username } })
    if (!member) throw new UnauthorizedException('账号不存在')

    const passed = await bcrypt.compare(password, member.password)
    if (!passed) throw new UnauthorizedException('账号或密码错误')

    const token = await this.jwt.signAsync(
      { sub: member.id, siteId: member.siteId, username: member.username },
      { secret: `${this.config.get<string>('jwt.secret')}_MEMBER`, expiresIn: '30d' }
    )
    return { token, member: { id: member.id, username: member.username, nickname: member.nickname } }
  }

  /** 校验会员 token（islands 组件调用） */
  verify(token: string): MemberPayload | null {
    try {
      return this.jwt.verify<MemberPayload>(token, { secret: `${this.config.get<string>('jwt.secret')}_MEMBER` })
    } catch {
      return null
    }
  }

  /** 当前会员信息：静态站 islands 组件登录后展示称呼 */
  async me(token: string) {
    const payload = this.verify(token)
    if (!payload) return { valid: false }
    const member = await this.prisma.member.findUnique({ where: { id: payload.sub } })
    if (!member) return { valid: false }
    return { valid: true, username: member.username, nickname: member.nickname, siteId: member.siteId }
  }
}
