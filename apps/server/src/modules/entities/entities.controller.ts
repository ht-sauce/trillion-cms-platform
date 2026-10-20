/**
 * 实体接口：GEO 实体一致性维护
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { EntitiesService } from './entities.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('实体')
@ApiBearerAuth()
@Controller('entities')
@UseGuards(AdminAuthGuard)
export class EntitiesController {
  constructor(private readonly service: EntitiesService) {}

  @Get()
  @ApiOperation({ summary: '实体列表' })
  list(@CurrentUser() user: AuthUser, @Query('siteId') siteId?: string, @Query('keyword') keyword?: string) {
    return this.service.list(user, siteId || undefined, keyword)
  }

  @Post()
  @ApiOperation({ summary: '新增实体' })
  create(@Body() body: { siteId?: string; name: string; aliases: unknown; type?: string; description?: string }) {
    return this.service.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑实体' })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除实体' })
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
