/**
 * 当前登录管理员装饰器
 * 简化控制器取值：@CurrentUser() user: AuthUser
 * 角色信息由「用户 → 角色」绑定解析而来（登录时写入 JWT，避免每请求查库）
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

export interface AuthUser {
  id: string
  username: string
  /** 绑定的角色 ID */
  roleId: string
  /** 角色标识，如 admin / site_admin */
  roleCode: string
  /** 角色名称（中文展示） */
  roleName: string
  /** 是否平台级角色：平台级操作的唯一判据（PlatformAdminGuard 使用） */
  platform: boolean
  /** 授权站点 ID；平台级角色为空数组表示全站点 */
  siteIds: string[]
}

export const CurrentUser = createParamDecorator((data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
  const user = request.user
  if (!user) return undefined
  return data ? user[data] : user
})
