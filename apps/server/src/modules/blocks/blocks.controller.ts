/**
 * 块定义接口
 * 读：站点级；写站点块：站点级；模板库（siteId = '0'，公共模板）与公共模板写操作：平台级
 * （平台级由 BlocksService 里的 assertSiteAccess(user, PUBLIC_BLOCK_SITE_ID) 落地，见 09 §4.5）
 */
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BlocksService } from './blocks.service'
import { ApplyBlockDto, CreateBlockDto, RollbackBlockDto, SaveBlockCodeDto } from './dto'
import { PUBLIC_BLOCK_SITE_ID } from './constants'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('块库（内容编辑器）')
@ApiBearerAuth()
@Controller('blocks')
@UseGuards(AdminAuthGuard)
export class BlocksController {
  constructor(private readonly service: BlocksService) {}

  @Get()
  @ApiOperation({ summary: '块库列表（本站块 + 公共模板）' })
  list(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.list(user, siteId || PUBLIC_BLOCK_SITE_ID)
  }

  @Get(':key')
  @ApiOperation({ summary: '块详情（含 Vue SFC 源码与字段声明；template=1 读公共模板）' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Query('siteId') siteId: string,
    @Query('template') template?: string
  ) {
    return this.service.detail(user, siteId, key, { template: template === '1' || template === 'true' })
  }

  @Post()
  @ApiOperation({ summary: '新建块（编译校验 + 声明抽取）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBlockDto) {
    return this.service.create(user, dto)
  }

  @Put(':key')
  @ApiOperation({ summary: '保存块代码（编译失败返回 400 + 行号）' })
  save(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: SaveBlockCodeDto) {
    return this.service.save(user, dto.siteId || PUBLIC_BLOCK_SITE_ID, key, dto.code)
  }

  @Get(':key/usages')
  @ApiOperation({ summary: '使用位置（引用了该块的页面清单）' })
  usages(@CurrentUser() user: AuthUser, @Param('key') key: string, @Query('siteId') siteId: string) {
    return this.service.usages(user, siteId, key)
  }

  @Post(':key/rollback')
  @ApiOperation({ summary: '回退上一版' })
  rollback(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: RollbackBlockDto) {
    return this.service.rollback(user, dto.siteId || PUBLIC_BLOCK_SITE_ID, key)
  }

  @Post(':key/apply')
  @ApiOperation({ summary: '把公共模板引入本站（复制为站点自有块，幂等）' })
  apply(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: ApplyBlockDto) {
    return this.service.apply(user, dto.siteId, key)
  }
}
