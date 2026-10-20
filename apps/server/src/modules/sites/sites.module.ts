/**
 * 站点模块：站点的增删改查（列表/详情/编辑），需登录；写操作限定平台管理员
 *
 * 额外提供建站描述导入器（BootstrapService，09 §12.2），
 * 它依赖内容编辑器（路径物化）与导航服务，因此本模块引入 ContentModule / NavigationModule。
 */
import { Module } from '@nestjs/common'
import { SitesController } from './sites.controller'
import { SitesService } from './sites.service'
import { BootstrapService } from './bootstrap.service'
import { ContentModule } from '../content/content.module'
import { NavigationModule } from '../navigation/navigation.module'
import { PublishModule } from '../publish/publish.module'

@Module({
  imports: [ContentModule, NavigationModule, PublishModule],
  controllers: [SitesController],
  providers: [SitesService, BootstrapService],
  exports: [SitesService, BootstrapService]
})
export class SitesModule {}
