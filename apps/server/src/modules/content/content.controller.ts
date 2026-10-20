/**
 * 内容接口：栏目、页面 CRUD、状态流转、GEO 体检
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ContentService } from './content.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { normalizePage, normalizePageSize } from '../../common/constants'
import { CreateChannelDto, CreatePageDto, StatusDto, UpdatePageDto } from './dto'

@ApiTags('内容')
@ApiBearerAuth()
@Controller('content')
@UseGuards(AdminAuthGuard)
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get('channels')
  @ApiOperation({ summary: '栏目树' })
  channels(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.channels(user, siteId)
  }

  @Post('channels')
  @ApiOperation({ summary: '新建栏目' })
  createChannel(@Body() dto: CreateChannelDto) {
    return this.service.createChannel(dto)
  }

  @Get('pages')
  @ApiOperation({ summary: '页面列表（自动附 GEO 评分）' })
  pages(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('channelId') channelId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.service.pages(user, siteId, channelId || undefined, normalizePage(page), normalizePageSize(pageSize))
  }

  @Get('pages/:id')
  @ApiOperation({ summary: '页面详情' })
  pageDetail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.pageDetail(user, id)
  }

  @Post('pages')
  @ApiOperation({ summary: '新建页面' })
  createPage(@Body() dto: CreatePageDto) {
    return this.service.createPage(dto)
  }

  @Patch('pages/:id')
  @ApiOperation({ summary: '编辑页面（模板 + Block）' })
  updatePage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.service.updatePage(id, dto)
  }

  @Patch('pages/:id/status')
  @ApiOperation({ summary: '状态流转 draft → pending_review → published（发布前执行 GEO 校验）' })
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.service.changeStatus(id, dto.status)
  }

  @Get('pages/:id/geo-check')
  @ApiOperation({ summary: 'GEO 体检' })
  geoCheck(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.geoCheck(id)
  }

  @Delete('pages/:id')
  @ApiOperation({ summary: '删除页面' })
  removePage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePage(id)
  }
}
