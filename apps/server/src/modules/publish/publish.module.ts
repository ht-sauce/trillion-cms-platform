/**
 * 发布模块：手动发布触发的构建任务与增量 SSG 执行
 * 设计要点：任务串行执行（同一时刻只跑一个构建），失败记录日志，成功后由 GEO 项目原子替换产物目录
 * 导出 ArtifactsService：内容编辑器据此派生页面发布徽标、下载分包
 */
import { Module } from '@nestjs/common'
import { PublishController } from './publish.controller'
import { PublishService } from './publish.service'
import { ArtifactsService } from './artifacts.service'
import { PublicModule } from '../public/public.module'

/**
 * 依赖 PublicModule：发布需要在「GEO 索引更新」里重新生成 robots/sitemap/llms.txt，
 * 而这三类文档的唯一生成实现在 PublicService（与 GEO 构建脚本共用同一份逻辑，见 09 §8.1）。
 */
@Module({
  imports: [PublicModule],
  controllers: [PublishController],
  providers: [PublishService, ArtifactsService],
  exports: [PublishService, ArtifactsService]
})
export class PublishModule {}
