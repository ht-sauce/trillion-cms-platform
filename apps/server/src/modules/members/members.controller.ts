/**
 * 会员接口（管理后台使用）
 */
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { MembersService } from './members.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { normalizePage, normalizePageSize } from '../../common/constants'

@ApiTags('站点会员')
@ApiBearerAuth()
@Controller('members')
@UseGuards(AdminAuthGuard)
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Get()
  @ApiOperation({ summary: '会员列表（按站点隔离）' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.service.list(user, siteId, keyword, normalizePage(page), normalizePageSize(pageSize))
  }

  @Post()
  @ApiOperation({ summary: '新增会员' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { siteId: string; username: string; password: string; nickname?: string }
  ) {
    return this.service.create(user, body.siteId, body.username, body.password, body.nickname)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会员' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id)
  }
}
