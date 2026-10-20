/**
 * 块定义模块：块代码的唯一事实来源（公共块 + 站点私有块）
 * 依赖 PublicService 仅用于内部接口按站点标识反查站点 ID
 */
import { Module } from '@nestjs/common'
import { BlocksController } from './blocks.controller'
import { BlocksInternalController } from './blocks-internal.controller'
import { BlocksService } from './blocks.service'
import { PublicModule } from '../public/public.module'

@Module({
  imports: [PublicModule],
  controllers: [BlocksController, BlocksInternalController],
  providers: [BlocksService],
  exports: [BlocksService]
})
export class BlocksModule {}
