/**
 * 导航模块：站点导航配置（独立配置数据）
 * 导出 NavigationService 供渲染引擎数据接口（public/geo）复用
 */
import { Module } from '@nestjs/common'
import { NavigationController } from './navigation.controller'
import { NavigationService } from './navigation.service'

@Module({
  controllers: [NavigationController],
  providers: [NavigationService],
  exports: [NavigationService]
})
export class NavigationModule {}
