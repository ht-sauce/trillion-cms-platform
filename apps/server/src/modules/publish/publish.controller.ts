/**
 * 发布接口：页面级发布、整站重建、任务列表、产物状态、回退、修复、下载
 */
import { Body, Controller, Get, Header, Param, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { PublishService } from './publish.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('发布')
@ApiBearerAuth()
@Controller('publish')
@UseGuards(AdminAuthGuard)
export class PublishController {
  constructor(private readonly service: PublishService) {}

  @Post('page/:siteId')
  @ApiOperation({ summary: '页面级增量发布（该页 + 首页级联，索引自动重生成）' })
  publishPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: { pageIds: string[] }) {
    return this.service.publishPage(user, siteId, body.pageIds || [])
  }

  @Post('site/:siteId')
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: '整站重建（平台级）' })
  rebuild(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.service.rebuild(user, siteId)
  }

  @Get('tasks')
  @ApiOperation({ summary: '发布任务列表（含构建日志与状态）' })
  tasks(@CurrentUser() user: AuthUser, @Query('siteId') siteId?: string) {
    return this.service.tasks(user, siteId || undefined)
  }

  @Get('artifacts/:siteId')
  @ApiOperation({ summary: '产物状态（逐页已发布 / 待发布 / 缺失 + 最近构建时间）' })
  artifacts(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.service.artifactSummary(user, siteId)
  }

  @Get('geo-docs/:siteId')
  @ApiOperation({ summary: '站点 GEO 产物内容（robots.txt / sitemap.xml / llms.txt，读取已构建产物文件）' })
  geoDocs(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.service.geoDocuments(user, siteId)
  }

  @Put('geo-docs/:siteId')
  @ApiOperation({
    summary: '手动替换站点 GEO 产物文件（非常规兜底；下次 GEO 索引更新 / 重建会按自动口径覆盖）'
  })
  saveGeoDocs(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() body: { key: string; content: string }
  ) {
    return this.service.saveGeoDocument(user, siteId, body.key, body.content)
  }

  @Post('rollback')
  @ApiOperation({ summary: '回退上一版（只回退产物，不动数据库内容，页面随即变为待发布）' })
  rollback(@CurrentUser() user: AuthUser, @Body() body: { siteId: string; pageId: string }) {
    return this.service.rollback(user, body.siteId, body.pageId)
  }

  @Post('repair')
  @ApiOperation({ summary: 'GEO 索引更新（只重生成 robots / sitemap / llms / 清单路由，不重渲染页面）' })
  repair(@CurrentUser() user: AuthUser, @Body() body: { siteId: string }) {
    return this.service.repair(user, body.siteId)
  }

  @Get('download/:siteId')
  @ApiOperation({ summary: '站点下载（mode=full 可直接托管 / mode=html 仅 HTML 与 GEO 产物）' })
  @Header('Content-Type', 'application/zip')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Query('mode') mode: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.service.download(user, siteId, mode === 'html' ? 'html' : 'full')
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    return new StreamableFile(new Uint8Array(result.buffer))
  }
}
