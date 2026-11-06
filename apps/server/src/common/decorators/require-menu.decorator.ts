/**
 * 菜单权限声明装饰器
 * 用法：`@RequireMenu('/monitor')`，由 MenuPermissionGuard 校验当前角色是否被授权该路径的启用菜单
 */
import { SetMetadata } from '@nestjs/common'

export const REQUIRE_MENU_KEY = 'require_menu'

export type MenuRequirement = string | string[] | { all: string[] } | { blocks: true }

export const RequireMenu = (requirement: MenuRequirement) => SetMetadata(REQUIRE_MENU_KEY, requirement)
