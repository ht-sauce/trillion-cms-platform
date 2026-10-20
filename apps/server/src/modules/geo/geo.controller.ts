/**
 * GEO 元数据接口
 *   - `POST /geo/preview`：文档生成预览（纯计算、不落盘）
 *   - `GET /geo/site-check`：站点级 GEO 就绪度体检（整站发布前检查清单，09 §10.4）
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { GeoService, type GeoPreviewTarget } from './geo.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('GEO 元数据')
@ApiBearerAuth()
@Controller('geo')
@UseGuards(AdminAuthGuard)
export class GeoController {
  constructor(private readonly service: GeoService) {}

  @Post('preview')
  @ApiOperation({ summary: 'GEO 文档生成预览（page-jsonld / entity-jsonld / llms / head / robots-meta）' })
  preview(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      siteId: string
      target: GeoPreviewTarget
      pageId?: string
      mode?: 'auto_append' | 'override'
      custom?: string
    }
  ) {
    return this.service.preview(user, {
      siteId: body.siteId,
      target: body.target,
      pageId: body.pageId || undefined,
      mode: body.mode,
      custom: body.custom
    })
  }

  @Get('site-check')
  @ApiOperation({ summary: '站点级 GEO 就绪度体检（实体声明 / llms / robots / sitemap / NAP）' })
  siteCheck(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.siteCheck(user, siteId)
  }
}
