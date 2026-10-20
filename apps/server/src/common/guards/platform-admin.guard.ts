/**
 * 平台级操作守卫
 * 判据：当前用户绑定的角色带 platform 标记（建站、改 renderMode、菜单/角色/用户维护等）
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthUser } from '../decorators/current-user.decorator'

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    if (!request.user?.platform) {
      throw new ForbiddenException('仅平台级角色可执行该操作')
    }
    return true
  }
}
