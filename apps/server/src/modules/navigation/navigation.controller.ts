/**
 * 导航配置接口
 * 读：站点级；写：站点级（分组键限定 header / footer-1 ~ footer-4）
 */
import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NavigationService } from './navigation.service'
import { SaveNavigationDto } from './dto'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

@ApiTags('导航管理')
@ApiBearerAuth()
@Controller('navigations')
@UseGuards(AdminAuthGuard)
export class NavigationController {
  constructor(private readonly service: NavigationService) {}

  @Get()
  @ApiOperation({ summary: '导航分组列表（header + 页脚四列，缺省分组自动补齐）' })
  list(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.list(user, siteId)
  }

  @Put(':key')
  @ApiOperation({ summary: '保存导航分组（整组全量覆盖）' })
  save(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: SaveNavigationDto) {
    return this.service.save(user, key, dto)
  }
}
