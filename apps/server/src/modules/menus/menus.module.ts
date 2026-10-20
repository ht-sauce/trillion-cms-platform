/**
 * 菜单模块：后台菜单的树查询与配置维护，需登录；写操作限定平台管理员
 */
import { Module } from '@nestjs/common'
import { MenusController } from './menus.controller'
import { MenusService } from './menus.service'

@Module({
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService]
})
export class MenusModule {}
