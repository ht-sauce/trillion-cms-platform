/**
 * 实体模块：集团品牌 / 产品 / 别名统一管理
 * 作用：避免同一品牌多种写法导致 AI 引擎实体识别分散（GEO 关键）
 */
import { Module } from '@nestjs/common'
import { EntitiesController } from './entities.controller'
import { EntitiesService } from './entities.service'

@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService]
})
export class EntitiesModule {}
