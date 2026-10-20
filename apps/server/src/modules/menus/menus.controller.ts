/**
 * 菜单接口：侧栏菜单树（登录即可，按角色过滤）+ 菜单配置维护（平台管理员）
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { MenusService } from './menus.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './dto'

@ApiTags('菜单')
@ApiBearerAuth()
@Controller('menus')
@UseGuards(AdminAuthGuard)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get('tree')
  @ApiOperation({ summary: '侧栏菜单树（按角色过滤，最多三级）' })
  tree(@CurrentUser() user: AuthUser) {
    return this.menusService.tree(user)
  }

  @Get()
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '菜单配置列表（平铺，含隐藏与停用项）' })
  list(@Query() query: QueryMenuDto) {
    return this.menusService.list(query)
  }

  @Post()
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '新建菜单' })
  create(@Body() dto: CreateMenuDto) {
    return this.menusService.create(dto)
  }

  @Patch(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '编辑菜单' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMenuDto) {
    return this.menusService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '删除菜单（存在子菜单时拒绝）' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.menusService.remove(id)
  }
}
