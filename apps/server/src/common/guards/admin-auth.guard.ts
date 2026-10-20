/**
 * JWT-A 鉴权守卫（管理后台）
 * 从 Authorization: Bearer <token> 解析并校验 JWT，成功后挂载 request.user
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { AuthUser } from '../decorators/current-user.decorator'

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const header = request.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('缺少登录凭证')

    let payload: AuthUser & { sub: string }
    try {
      payload = await this.jwt.verifyAsync<AuthUser & { sub: string }>(token, {
        secret: this.config.get<string>('jwt.secret')
      })
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期')
    }

    /** 兼容 RBAC 升级前签发的旧 token（载荷不含角色信息）：直接要求重新登录，避免出现"已登录却无权限" */
    if (!payload.roleId) throw new UnauthorizedException('登录凭证缺少角色信息，请重新登录')

    request.user = {
      id: payload.sub,
      username: payload.username,
      roleId: payload.roleId,
      roleCode: payload.roleCode,
      roleName: payload.roleName,
      platform: Boolean(payload.platform),
      siteIds: payload.siteIds || []
    }
    return true
  }
}
