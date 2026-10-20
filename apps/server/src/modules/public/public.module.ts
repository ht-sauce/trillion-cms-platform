/**
 * 公开数据模块：供 GEO 项目（站点前台）在构建期与 SSR 运行时读取
 * 只读已发布内容，不含任何鉴权，返回字段已裁剪（不返回企业内部敏感字段）
 */
import { Module } from '@nestjs/common'
import { PublicController } from './public.controller'
import { PublicService } from './public.service'
import { NavigationModule } from '../navigation/navigation.module'

@Module({
  imports: [NavigationModule],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService]
})
export class PublicModule {}
