/**
 * 新闻 / 问答管理接口（news-faq，表驱动）
 *
 * 管理面对「新闻资讯」（NewsArticle 表）与「高频问答」（FaqItem 表）的 CRUD 入口，
 * Page（/news/*、/faq/q* 详情页）是发布产物，由服务端随保存自动派生与发布：
 *   GET    /news-faq/articles            文章分页列表
 *   GET    /news-faq/articles/:id/detail 单条文章详情（纯读，直读表，不接收 siteId 参数）
 *   POST   /news-faq/articles            新建文章（保存即发布）
 *   PATCH  /news-faq/articles/:id        编辑文章（slug 创建后不可改）
 *   DELETE /news-faq/articles/:id        删除文章
 *   GET    /news-faq/faqs                问答分页列表（支持分类过滤）
 *   GET    /news-faq/categories          问答分类清单（FaqItem.category 去重）
 *   GET    /news-faq/faqs/:id/detail     单条问答详情（纯读，直读表，不接收 siteId 参数）
 *   POST   /news-faq/faqs                新建问答
 *   PATCH  /news-faq/faqs/:id            编辑问答（slug 创建后不可改）
 *   DELETE /news-faq/faqs/:id            删除问答
 *
 * 增删改均会：写管理表 → 派生/补建详情页与列表页块 → 自动触发页面级发布，
 * 响应携带 affectedPages（受影响页面）与 publishTaskId（发布任务标识）。
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NewsFaqService } from './news-faq.service'
import { CreateArticleDto, CreateFaqDto, UpdateArticleDto, UpdateFaqDto } from './dto'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { normalizePage, normalizePageSize } from '../../common/constants'

@ApiTags('新闻问答')
@ApiBearerAuth()
@Controller('news-faq')
@UseGuards(AdminAuthGuard)
export class NewsFaqController {
  constructor(private readonly service: NewsFaqService) {}

  // ---------------- 新闻资讯 ----------------

  @Get('articles')
  @ApiOperation({ summary: '文章分页列表（读 NewsArticle 表，按发布日期倒序，keyword 模糊匹配标题）' })
  listArticles(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string
  ) {
    return this.service.listArticles(user, siteId, normalizePage(page), normalizePageSize(pageSize), keyword)
  }

  @Get('articles/:id/detail')
  @ApiOperation({ summary: '单条文章详情（直读表；鉴权按记录归属站点判定，content 为纯文本正文）' })
  getArticleDetail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getArticleDetail(user, id)
  }

  @Post('articles')
  @ApiOperation({ summary: '新建文章（保存即发布，自动派生详情页/列表页并触发页面级发布）' })
  createArticle(@CurrentUser() user: AuthUser, @Body() dto: CreateArticleDto) {
    return this.service.createArticle(user, dto)
  }

  @Patch('articles/:id')
  @ApiOperation({ summary: '编辑文章（slug 不可改；页面缺失自动补建，重算列表页并触发页面级发布）' })
  updateArticle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.service.updateArticle(user, id, dto)
  }

  @Delete('articles/:id')
  @ApiOperation({ summary: '删除文章（删发布产物页面与表记录，重算列表页并触发页面级发布）' })
  removeArticle(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeArticle(user, id)
  }

  // ---------------- 高频问答 ----------------

  @Get('categories')
  @ApiOperation({ summary: '问答分类清单（FaqItem 表 category 去重）' })
  listCategories(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.service.listCategories(user, siteId)
  }

  @Get('faqs')
  @ApiOperation({ summary: '问答分页列表（读 FaqItem 表，按 slug 升序，支持 keyword / category 过滤）' })
  listFaqs(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string
  ) {
    return this.service.listFaqs(user, siteId, normalizePage(page), normalizePageSize(pageSize), keyword, category)
  }

  @Get('faqs/:id/detail')
  @ApiOperation({ summary: '单条问答详情（直读表；鉴权按记录归属站点判定，answer 为纯文本答案）' })
  getFaqDetail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFaqDetail(user, id)
  }

  @Post('faqs')
  @ApiOperation({ summary: '新建问答（保存即发布，自动派生详情页/列表页/相关问答并触发页面级发布）' })
  createFaq(@CurrentUser() user: AuthUser, @Body() dto: CreateFaqDto) {
    return this.service.createFaq(user, dto)
  }

  @Patch('faqs/:id')
  @ApiOperation({ summary: '编辑问答（slug 不可改；重算新旧分类的列表页/相关问答并触发页面级发布）' })
  updateFaq(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.service.updateFaq(user, id, dto)
  }

  @Delete('faqs/:id')
  @ApiOperation({ summary: '删除问答（删发布产物页面与表记录，重算列表页/相关问答并触发页面级发布）' })
  removeFaq(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeFaq(user, id)
  }
}
