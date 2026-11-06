/**
 * 站点接口：列表 / 详情 / 新建 / 编辑 / 删除
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SitesService } from './sites.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { BootstrapSiteDto, CreateSiteDto, QuerySiteDto, UpdateSiteDto } from './dto'
import { BootstrapService } from './bootstrap.service'

@ApiTags('站点')
@ApiBearerAuth()
@Controller('sites')
@UseGuards(AdminAuthGuard, MenuPermissionGuard)
@RequireMenu('/sites')
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly bootstrapService: BootstrapService
  ) {}

  @Get()
  @RequireMenu([
    '/sites',
    '/content',
    '/content/editor',
    '/blocks',
    '/navigations',
    '/files',
    '/members',
    '/monitor',
    '/sites/news',
    '/sites/faqs',
    '/sites/products',
    '/sites/cases',
    '/sites/demands'
  ])
  @ApiOperation({ summary: '站点列表（分页、支持关键字与筛选）' })
  list(@CurrentUser() user: AuthUser, @Query() query: QuerySiteDto) {
    return this.sitesService.list(user, query)
  }

  @Get(':id')
  @ApiOperation({ summary: '站点详情（含 Logo/执照文件 URL）' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sitesService.detail(user, id)
  }

  @Post()
  @ApiOperation({ summary: '新建站点' })
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑站点' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除站点' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sitesService.remove(id)
  }

  @Post('bootstrap')
  @ApiOperation({ summary: '建站描述导入（站点档案 + 目录树 + 页面与块 + 导航，幂等）' })
  bootstrap(@CurrentUser() user: AuthUser, @Body() dto: BootstrapSiteDto) {
    return this.bootstrapService.run(user, dto)
  }
}
