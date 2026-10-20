/**
 * 鉴权服务：账号密码校验 + JWT 签发 + 当前用户信息组装
 * 角色解析：用户 →（roleId 绑定）角色；角色信息随 JWT 下发，守卫与接口不再每请求查库
 * 密码使用 bcrypt 存储与比对，永不返回密码字段
 */
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { jwtExpiresIn } from '../../common/utils/jwt-expiry'
import type { AdminUserEntity } from '@trillion/shared'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  /** 登录：校验账号密码与角色状态后签发 JWT-A */
  async login(username: string, password: string) {
    const record = await this.prisma.adminUser.findUnique({ where: { username }, include: { role: true } })
    if (!record || !record.enabled) throw new UnauthorizedException('账号不存在或已停用')
    if (record.role.status !== 'active') throw new UnauthorizedException('账号所属角色已停用，请联系平台管理员')

    const passed = await bcrypt.compare(password, record.password)
    if (!passed) throw new UnauthorizedException('账号或密码错误')

    const authUser: AuthUser = {
      id: record.id,
      username: record.username,
      roleId: record.roleId,
      roleCode: record.role.code,
      roleName: record.role.name,
      platform: record.role.platform,
      siteIds: this.toSiteIds(record.siteIds)
    }

    const token = await this.jwt.signAsync(
      {
        sub: authUser.id,
        username: authUser.username,
        roleId: authUser.roleId,
        roleCode: authUser.roleCode,
        roleName: authUser.roleName,
        platform: authUser.platform,
        siteIds: authUser.siteIds
      },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: jwtExpiresIn(this.config.get<string>('jwt.expiresIn'))
      }
    )

    const profile: AdminUserEntity = {
      id: record.id,
      username: record.username,
      displayName: record.displayName,
      roleId: authUser.roleId,
      roleCode: authUser.roleCode,
      roleName: authUser.roleName,
      platform: authUser.platform,
      siteIds: authUser.siteIds
    }

    return { token, user: profile }
  }

  /** 当前用户信息（含角色与授权站点） */
  async profile(authUser: AuthUser): Promise<AdminUserEntity> {
    const record = await this.prisma.adminUser.findUnique({ where: { id: authUser.id }, include: { role: true } })
    if (!record) throw new UnauthorizedException('账号不存在')
    return {
      id: record.id,
      username: record.username,
      displayName: record.displayName,
      roleId: record.roleId,
      roleCode: record.role.code,
      roleName: record.role.name,
      platform: record.role.platform,
      siteIds: this.toSiteIds(record.siteIds)
    }
  }

  /** siteIds JSON 字段收窄为数组 */
  private toSiteIds(value: unknown): string[] {
    return Array.isArray(value) ? (value as string[]) : []
  }
}
