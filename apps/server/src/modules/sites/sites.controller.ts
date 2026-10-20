/**
 * 站点接口：列表 / 详情 / 新建 / 编辑 / 删除
 * 建站、改渲染模式等平台级操作由 PlatformAdminGuard 限制
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SitesService } from './sites.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { BootstrapSiteDto, CreateSiteDto, QuerySiteDto, UpdateSiteDto } from './dto'
import { BootstrapService } from './bootstrap.service'

@ApiTags('站点')
@ApiBearerAuth()
@Controller('sites')
@UseGuards(AdminAuthGuard)
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly bootstrapService: BootstrapService
  ) {}

  @Get()
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
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '新建站点' })
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto)
  }

  @Patch(':id')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '编辑站点' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(PlatformAdminGuard)
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
