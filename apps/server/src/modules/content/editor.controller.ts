/**
 * 站点内容编辑器接口（09 §6）
 *
 * 与既有 `content.controller.ts`（旧的页面管理链路）并存：
 *   - `content/*`        ：页面列表 + 状态流转 + GEO 体检（沿用）
 *   - `content/editor/*` ：内容树 + 目录/页面增删改 + 上下移 + 三态草稿（本期新增）
 *
 * 路径分开是刻意的：编辑器是「站点维度」的操作台，与平台级内容列表的关注点不同，
 * 混在一起会让 DTO 与权限判定互相牵扯。
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ContentEditorService } from './editor.service'
import {
  CreateChannelDto,
  CreatePageDto,
  MoveDto,
  SaveDraftDto,
  UpdateChannelDto,
  UpdatePageMetaDto
} from './editor.dto'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('内容编辑器')
@ApiBearerAuth()
@Controller('content/editor')
@UseGuards(AdminAuthGuard)
export class ContentEditorController {
  constructor(private readonly service: ContentEditorService) {}

  // ---------------- 内容树 ----------------

  @Get('tree')
  @ApiOperation({ summary: '内容树（目录 + 页面 + 块摘要 + 发布徽标）' })
  tree(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.tree(user, siteId)
  }

  @Post('recompute-paths')
  @ApiOperation({ summary: '重算整站路径（数据修复用）' })
  recomputePaths(@CurrentUser() user: AuthUser, @Body('siteId') siteId: string) {
    return this.service.recomputePaths(siteId)
  }

  // ---------------- 目录 ----------------

  @Post('channels')
  @ApiOperation({ summary: '新建目录' })
  createChannel(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) {
    return this.service.createChannel(user, dto)
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: '编辑目录（已发布页面所在目录的 slug 锁定）' })
  updateChannel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return this.service.updateChannel(user, id, dto)
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: '删除目录（存在子内容时拒绝）' })
  removeChannel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeChannel(user, id)
  }

  @Post('channels/:id/move')
  @ApiOperation({ summary: '目录同级上下移' })
  moveChannel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.service.moveChannel(user, id, dto)
  }

  // ---------------- 页面 ----------------

  @Post('pages')
  @ApiOperation({ summary: '新建页面' })
  createPage(@CurrentUser() user: AuthUser, @Body() dto: CreatePageDto) {
    return this.service.createPage(user, dto)
  }

  @Patch('pages/:id')
  @ApiOperation({ summary: '编辑页面元信息（已发布页面的 URL 锁定）' })
  updatePageMeta(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePageMetaDto
  ) {
    return this.service.updatePageMeta(user, id, dto)
  }

  @Delete('pages/:id')
  @ApiOperation({ summary: '删除页面（已发布页转为下线并保留记录）' })
  removePage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePage(user, id)
  }

  @Post('pages/:id/move')
  @ApiOperation({ summary: '页面同级上下移' })
  movePage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.service.movePage(user, id, dto)
  }

  // ---------------- 三态草稿 ----------------

  @Get('pages/:id/draft')
  @ApiOperation({ summary: '读取整页草稿（无草稿时返回线上快照）' })
  getDraft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDraft(user, id)
  }

  @Put('pages/:id/draft')
  @ApiOperation({ summary: '保存整页草稿（后写覆盖，不构建、不影响线上）' })
  saveDraft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveDraftDto) {
    return this.service.saveDraft(user, id, dto)
  }

  @Delete('pages/:id/draft')
  @ApiOperation({ summary: '丢弃草稿（回退到线上快照）' })
  deleteDraft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDraft(user, id)
  }

  @Post('pages/:id/refresh-hash')
  @ApiOperation({ summary: '重算页面内容指纹' })
  refreshHash(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.refreshContentHash(id)
  }
}
