/**
 * 预览模块：后台 iframe 预览通道（短时效票据 + 草稿覆盖）
 * 依赖 PublicModule 复用「页面详情」的唯一构建口径，避免预览与线上渲染两套映射
 */
import { Module } from '@nestjs/common'
import { PreviewController } from './preview.controller'
import { PreviewService } from './preview.service'
import { PublicModule } from '../public/public.module'

@Module({
  imports: [PublicModule],
  controllers: [PreviewController],
  providers: [PreviewService],
  exports: [PreviewService]
})
export class PreviewModule {}
