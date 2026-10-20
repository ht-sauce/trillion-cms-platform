/**
 * 新闻问答模块：管理面 CRUD + 派生块同步 + 自动页面级发布
 * 管理源是独立数据表（NewsArticle / FaqItem，prisma/schema/news-faq.prisma），
 * 「Page + 块数据」是发布产物；本模块对外提供 /news-faq/* 接口
 */
import { Module } from '@nestjs/common'
import { NewsFaqController } from './news-faq.controller'
import { NewsFaqService } from './news-faq.service'
import { NewsFaqSyncService } from './news-faq-sync.service'
import { ContentModule } from '../content/content.module'
import { PublishModule } from '../publish/publish.module'

@Module({
  imports: [ContentModule, PublishModule],
  controllers: [NewsFaqController],
  providers: [NewsFaqService, NewsFaqSyncService],
  exports: [NewsFaqSyncService]
})
export class NewsFaqModule {}
