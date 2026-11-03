/**
 * 产品体系 / 成功案例管理模块（catalog）
 *
 * 承接 ProductIndustry / Product / CaseStudy 三类管理源的表驱动 CRUD，
 * 页面派生与列表页重算由 CatalogSyncService 负责（依赖 ContentEditorService 与 PublishService）。
 */
import { Module } from '@nestjs/common'
import { ContentModule } from '../content/content.module'
import { PublishModule } from '../publish/publish.module'
import { CatalogController } from './catalog.controller'
import { CatalogSyncService } from './catalog-sync.service'
import { ProductsService } from './products.service'
import { CasesService } from './cases.service'

@Module({
  imports: [ContentModule, PublishModule],
  controllers: [CatalogController],
  providers: [CatalogSyncService, ProductsService, CasesService]
})
export class CatalogModule {}
