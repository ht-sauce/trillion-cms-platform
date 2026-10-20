/**
 * 预览接口
 *   POST /preview/ticket     后台发起（站点级鉴权）→ 返回 iframe 地址与票据
 *   GET  /preview/page/:id   渲染引擎调用（内部令牌或票据）→ 返回「线上快照 + 草稿覆盖」
 */
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PreviewService } from './preview.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('预览')
@Controller('preview')
export class PreviewController {
  constructor(private readonly service: PreviewService) {}

  @Post('ticket')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: '生成预览票据（默认 30 分钟，仅能读单页草稿）' })
  ticket(@CurrentUser() user: AuthUser, @Body() dto: { siteId: string; pageId: string }) {
    return this.service.createTicket(user, dto)
  }

  @Get('resolve')
  @ApiOperation({ summary: '解析预览票据（渲染引擎中间件用：票据 → pageId）' })
  resolve(@Query('ticket') ticket: string) {
    return this.service.resolveTicket(ticket)
  }

  @Get('page/:id')
  @ApiOperation({ summary: '预览页面数据（渲染引擎专用：票据 + 内部令牌）' })
  page(
    @Param('id') id: string,
    @Query('__preview') ticket?: string,
    @Query('ticket') ticketAlt?: string,
    @Headers('x-internal-token') internalToken?: string
  ) {
    const value = ticket || ticketAlt
    if (!value && !internalToken) throw new BadRequestException('缺少预览票据')
    return this.service.previewPage(id, value, internalToken)
  }
}
