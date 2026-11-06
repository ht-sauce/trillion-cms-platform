/**
 * 菜单权限守卫（接口级安全边界）
 *
 * 判据：当前用户角色在 `RoleMenu` 中被授权了指定路径的**启用**菜单。
 * 菜单隐藏只是体验层，不能代替接口鉴权；本守卫用于把「有菜单」落到「能调接口」。
 *
 * 用法：`@RequireMenu('/monitor')` + `@UseGuards(AdminAuthGuard, MenuPermissionGuard)`
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'
import { REQUIRE_MENU_KEY, type MenuRequirement } from '../decorators/require-menu.decorator'
import type { AuthUser } from '../decorators/current-user.decorator'

@Injectable()
export class MenuPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<MenuRequirement | undefined>(REQUIRE_MENU_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!requirement) throw new ForbiddenException('该接口未声明功能菜单')

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const user = request.user
    if (!user?.roleId) throw new UnauthorizedException('缺少登录凭证')

    const all = typeof requirement === 'object' && !Array.isArray(requirement) && 'all' in requirement
    let paths: string[]
    if (typeof requirement === 'object' && !Array.isArray(requirement) && 'blocks' in requirement) {
      const source = request.method === 'GET' ? request.query : request.body
      const template = request.query.template === '1' || request.query.template === 'true'
      paths = [
        template || source?.scope === 'public' || !source?.siteId || source.siteId === '0'
          ? '/blocks/templates'
          : '/blocks'
      ]
    } else {
      paths =
        typeof requirement === 'string' ? [requirement] : Array.isArray(requirement) ? requirement : requirement.all
    }
    const checks = await Promise.all(
      paths.map(async (path) => {
        const menu = await this.prisma.menu.findFirst({ where: { path, status: 'active' }, select: { id: true } })
        if (!menu) return false
        return Boolean(
          await this.prisma.roleMenu.findUnique({
            where: { roleId_menuId: { roleId: user.roleId, menuId: menu.id } },
            select: { roleId: true }
          })
        )
      })
    )
    if (!checks.length || !(all ? checks.every(Boolean) : checks.some(Boolean)))
      throw new ForbiddenException('无权访问该功能或菜单已停用')
    return true
  }
}
