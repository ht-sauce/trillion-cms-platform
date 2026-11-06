/**
 * 产品体系 / 成功案例管理接口（catalog，表驱动）
 *
 * 管理面对「产品体系」（ProductIndustry + Product 表）与「成功案例」（CaseStudy 表）的 CRUD，
 * Page（/products、/products/*、/cases、/cases/*）是发布产物，随保存自动派生与发布：
 *   GET    /catalog/industries            行业分组清单（含组内产品数）
 *   POST   /catalog/industries            新建行业分组
 *   PATCH  /catalog/industries/:id        编辑行业分组（改名同步产品引用）
 *   DELETE /catalog/industries/:id        删除行业分组（仍有产品引用时拒绝）
 *   GET    /catalog/products              产品分页列表（keyword / series / industry 过滤）
 *   GET    /catalog/products/:id/detail   单条产品详情（含结构化详情字段）
 *   POST   /catalog/products              新建产品（保存即发布）
 *   PATCH  /catalog/products/:id          编辑产品（slug 创建后不可改）
 *   DELETE /catalog/products/:id          删除产品
 *   GET    /catalog/cases                 案例分页列表（keyword / industry 过滤）
 *   GET    /catalog/cases/:id/detail      单条案例详情
 *   POST   /catalog/cases                 新建案例（保存即发布）
 *   PATCH  /catalog/cases/:id             编辑案例
 *   DELETE /catalog/cases/:id             删除案例
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { CasesService } from './cases.service'
import {
  CreateCaseDto,
  CreateIndustryDto,
  CreateProductDto,
  UpdateCaseDto,
  UpdateIndustryDto,
  UpdateProductDto
} from './dto'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { normalizePage, normalizePageSize } from '../../common/constants'

@ApiTags('产品与案例')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(AdminAuthGuard, MenuPermissionGuard)
@RequireMenu('/sites/products')
export class CatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly cases: CasesService
  ) {}

  // ---------------- 行业分组 ----------------

  @Get('industries')
  @ApiOperation({ summary: '行业分组清单（按 sort 升序，含组内产品数）' })
  listIndustries(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.products.listIndustries(user, siteId)
  }

  @Post('industries')
  @ApiOperation({ summary: '新建行业分组（重算 /products 分组并触发发布）' })
  createIndustry(@CurrentUser() user: AuthUser, @Body() dto: CreateIndustryDto) {
    return this.products.createIndustry(user, dto)
  }

  @Patch('industries/:id')
  @ApiOperation({ summary: '编辑行业分组（改名同步产品内的行业引用）' })
  updateIndustry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIndustryDto
  ) {
    return this.products.updateIndustry(user, id, dto)
  }

  @Delete('industries/:id')
  @ApiOperation({ summary: '删除行业分组（分组内仍有产品时拒绝）' })
  removeIndustry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.removeIndustry(user, id)
  }

  // ---------------- 产品 ----------------

  @Get('products')
  @ApiOperation({ summary: '产品分页列表（keyword 匹配名称/中文名，可按系列与行业过滤）' })
  listProducts(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('series') series?: string,
    @Query('industry') industry?: string
  ) {
    return this.products.listProducts(
      user,
      siteId,
      normalizePage(page),
      normalizePageSize(pageSize),
      keyword,
      series,
      industry
    )
  }

  @Get('products/:id/detail')
  @ApiOperation({ summary: '单条产品详情（含系统说明/构造/特点/色卡/常见问题，编辑回显用）' })
  getProduct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.getProduct(user, id)
  }

  @Post('products')
  @ApiOperation({ summary: '新建产品（保存即发布，自动派生详情页/列表分组并触发页面级发布）' })
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.createProduct(user, dto)
  }

  @Patch('products/:id')
  @ApiOperation({ summary: '编辑产品（slug 不可改；详情页缺失自动补建并重算列表分组）' })
  updateProduct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.updateProduct(user, id, dto)
  }

  @Delete('products/:id')
  @ApiOperation({ summary: '删除产品（删发布产物页面与表记录，重算列表分组并触发发布）' })
  removeProduct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.removeProduct(user, id)
  }

  // ---------------- 成功案例 ----------------

  @Get('cases')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '案例分页列表（keyword 匹配标题，可按行业过滤）' })
  listCases(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('industry') industry?: string
  ) {
    return this.cases.listCases(user, siteId, normalizePage(page), normalizePageSize(pageSize), keyword, industry)
  }

  @Get('cases/:id/detail')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '单条案例详情（含正文/项目信息/项目画面，编辑回显用）' })
  getCase(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.getCase(user, id)
  }

  @Post('cases')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '新建案例（保存即发布，自动派生详情页并重算列表卡片）' })
  createCase(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseDto) {
    return this.cases.createCase(user, dto)
  }

  @Patch('cases/:id')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '编辑案例（slug 不可改；详情页缺失自动补建并重算列表卡片）' })
  updateCase(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaseDto) {
    return this.cases.updateCase(user, id, dto)
  }

  @Delete('cases/:id')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '删除案例（删发布产物页面与表记录，重算列表卡片并触发发布）' })
  removeCase(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.removeCase(user, id)
  }

  // ---------------- 批量重建 ----------------

  @Post('products/rebuild')
  @ApiOperation({ summary: '批量重建产品派生页面（导入/修复用）：全部产品补建或刷新详情页 + 重算列表页，统一发布一次' })
  rebuildProducts(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.products.rebuild(user, siteId)
  }

  @Post('cases/rebuild')
  @RequireMenu('/sites/cases')
  @ApiOperation({ summary: '批量重建案例派生页面（导入/修复用）：全部案例补建或刷新详情页 + 重算列表页，统一发布一次' })
  rebuildCases(@CurrentUser() user: AuthUser, @Query('siteId') siteId: string) {
    return this.cases.rebuild(user, siteId)
  }
}
