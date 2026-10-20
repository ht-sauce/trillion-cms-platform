/**
 * 角色接口：角色增删改查 + 角色-菜单授权（全部限平台级角色）
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RolesService } from './roles.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { CreateRoleDto, QueryRoleDto, SaveRoleMenusDto, UpdateRoleDto } from './dto'

@ApiTags('角色')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(AdminAuthGuard, PlatformAdminGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: '角色列表（含授权菜单与用户数）' })
  list(@Query() query: QueryRoleDto) {
    return this.rolesService.list(query)
  }

  @Post()
  @ApiOperation({ summary: '新建角色' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑角色（内置角色标识与状态受保护）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除角色（内置角色或仍有用户绑定时拒绝）' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id)
  }

  @Put(':id/menus')
  @ApiOperation({ summary: '保存角色的菜单授权（覆盖式，自动补全上级菜单）' })
  saveMenus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRoleMenusDto) {
    return this.rolesService.saveMenus(id, dto.menuIds)
  }
}
