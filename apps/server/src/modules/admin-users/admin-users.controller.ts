/**
 * 后台用户接口：用户增删改查与角色分配（全部限平台级角色）
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminUsersService } from './admin-users.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { CreateAdminUserDto, QueryAdminUserDto, UpdateAdminUserDto } from './dto'

@ApiTags('后台用户')
@ApiBearerAuth()
@Controller('admin-users')
@UseGuards(AdminAuthGuard, PlatformAdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: '用户列表（分页、支持关键字与角色筛选）' })
  list(@Query() query: QueryAdminUserDto) {
    return this.adminUsersService.list(query)
  }

  @Post()
  @ApiOperation({ summary: '新建用户（含角色绑定与站点授权）' })
  create(@Body() dto: CreateAdminUserDto) {
    return this.adminUsersService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑用户（账号不可改，密码留空表示不修改）' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminUsersService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户（不能删除自己，且须保留至少一个平台级用户）' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.remove(user, id)
  }
}
