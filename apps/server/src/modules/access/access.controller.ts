/**
 * 入站访问记录接口
 *
 * - `POST /internal/access-events`：GEO 中间件异步写入（内部令牌鉴权，不暴露公开写入口）
 * - `GET /access-events`：管理后台分页明细（登录 + GEO 监控菜单授权）
 */
import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { AccessService } from './access.service'
import { CreateAccessEventDto, QueryAccessEventDto } from './dto'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'

@ApiTags('入站访问监控')
@Controller()
export class AccessController {
  constructor(
    private readonly service: AccessService,
    private readonly config: ConfigService
  ) {}

  @Post('internal/access-events')
  @HttpCode(200)
  @ApiOperation({ summary: '写入单条入站访问记录（GEO 中间件调用）' })
  ingest(@Headers('x-internal-token') token: string | undefined, @Body() dto: CreateAccessEventDto) {
    this.assertInternal(token)
    return this.service.create(dto)
  }

  @Get('access-events')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, MenuPermissionGuard)
  @RequireMenu('/monitor')
  @ApiOperation({ summary: '入站请求分页明细（筛选 + 分页）' })
  list(@Query() query: QueryAccessEventDto) {
    return this.service.list(query)
  }

  /** 内部令牌缺失或错误一律拒绝，不提供「未配置即放行」的裸奔分支 */
  private assertInternal(token?: string) {
    const expected = this.config.get<string>('internalToken') || ''
    if (!expected || token !== expected) throw new ForbiddenException('内部调用凭证无效')
  }
}
