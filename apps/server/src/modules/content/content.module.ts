/**
 * 内容模块：栏目（Channel）与页面（Page）
 * 页面 = 模板 + 结构化 Block；状态流 draft → pending_review → published
 *
 * 本期新增「站点内容编辑器」链路（ContentEditorController / ContentEditorService）：
 * 它是块库编译产物、路径物化与三态草稿的协调者，因此需要注入 BlocksService 与 ArtifactsService。
 */
import { Module } from '@nestjs/common'
import { ContentController } from './content.controller'
import { ContentService } from './content.service'
import { ContentEditorController } from './editor.controller'
import { ContentEditorService } from './editor.service'
import { BlocksModule } from '../blocks/blocks.module'
import { PublishModule } from '../publish/publish.module'

@Module({
  imports: [BlocksModule, PublishModule],
  controllers: [ContentController, ContentEditorController],
  providers: [ContentService, ContentEditorService],
  exports: [ContentService, ContentEditorService]
})
export class ContentModule {}
