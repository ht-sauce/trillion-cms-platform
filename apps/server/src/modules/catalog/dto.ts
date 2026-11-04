/**
 * 产品体系 / 成功案例管理 DTO
 *
 * 字段即表字段的写入投影：产品 = 卡片字段（名称/中文名/系列/行业/标签/图片/说明）
 * + 详情字段（导语/标签/大图/系统说明/构造/特点/色卡/常见问题，均可空）；
 * 案例 = 卡片字段（标题/行业/业主/地点/面积/年份/体系/图片）+ 详情字段（导语/标签/大图/
 * 结构化正文/项目画面）。正文以 bodyBlocks 结构化块为准（与新闻同一套 ArticleBlock），
 * body 是服务端派生的纯文本列；行业只能传 industryId（或命中已有分类的名称快照），
 * 自由文本一律 400；infoRows 由服务端按字段生成，DTO 不收。slug 创建后不可修改。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { ArticleBlockDto, SLUG_PATTERN } from '../news-faq/dto'

export class CreateIndustryDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiProperty({ description: '分组名称（站点内唯一，/products 页分组标题）' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @ApiPropertyOptional({ description: '分组介绍文案（section-head.desc）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @ApiPropertyOptional({ description: '分组头更多链接文案（section-head.moreLabel，可空）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  moreLabel?: string

  @ApiPropertyOptional({ description: '排序（缺省排到末位）' })
  @IsOptional()
  @IsInt()
  sort?: number
}

export class UpdateIndustryDto {
  @ApiPropertyOptional({ description: '分组名称（改名会同步产品内的行业引用）' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ description: '分组介绍文案' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @ApiPropertyOptional({ description: '分组头更多链接文案（传空串即清除）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  moreLabel?: string

  @ApiPropertyOptional({ description: '排序（升序）' })
  @IsOptional()
  @IsInt()
  sort?: number
}

/** 产品创建/编辑共用字段（编辑时均可选） */
export class CreateProductDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiProperty({ description: '产品名（卡片主标题，如 ForinCrete SL）' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string

  @ApiPropertyOptional({ description: '中文名称（卡片副标题 / 详情页头部）' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cnName?: string

  @ApiPropertyOptional({ description: '树脂系列（第二种分类维度，如 ForinCrete）' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string

  @ApiPropertyOptional({ description: '所属行业分组名清单（一个产品可属多个行业）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[]

  @ApiPropertyOptional({ description: '一句话说明（卡片 desc）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @ApiPropertyOptional({ description: '卡片图片地址' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  img?: string

  @ApiPropertyOptional({ description: '详情页导语（空则回落 desc）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lead?: string

  @ApiPropertyOptional({ description: '详情页头部标签（空则回落卡片标签）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chips?: string[]

  @ApiPropertyOptional({ description: '详情页大图（空则回落卡片图）' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bgImage?: string

  @ApiPropertyOptional({ description: '卡片特性标签', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '系统说明（[{k,v}]，vcard-grid）' })
  @IsOptional()
  @IsArray()
  systemIntro?: { k: string; v: string }[]

  @ApiPropertyOptional({ description: '系统构造分层（layer-stack layers）' })
  @IsOptional()
  @IsArray()
  layers?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '系统特点（feature-cards items）' })
  @IsOptional()
  @IsArray()
  features?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '标准色卡（color-palette swatches）' })
  @IsOptional()
  @IsArray()
  colors?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '产品常见问题（faq-list items [{q,a}]）' })
  @IsOptional()
  @IsArray()
  faqs?: { q: string; a: string }[]

  @ApiPropertyOptional({ description: 'URL 片段（缺省由名称生成；创建后不可修改）' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug 只允许小写字母、数字与连字符，且不以连字符开头' })
  slug?: string

  @ApiPropertyOptional({ description: '列表排序（升序）' })
  @IsOptional()
  @IsInt()
  sort?: number
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: '产品名' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @ApiPropertyOptional({ description: '中文名称' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cnName?: string

  @ApiPropertyOptional({ description: '树脂系列' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  series?: string

  @ApiPropertyOptional({ description: '所属行业分组名清单（空数组 = 取消分组）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[]

  @ApiPropertyOptional({ description: '一句话说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @ApiPropertyOptional({ description: '卡片图片地址' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  img?: string

  @ApiPropertyOptional({ description: '详情页导语' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lead?: string

  @ApiPropertyOptional({ description: '详情页头部标签', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chips?: string[]

  @ApiPropertyOptional({ description: '详情页大图' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bgImage?: string

  @ApiPropertyOptional({ description: '卡片特性标签', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '系统说明' })
  @IsOptional()
  @IsArray()
  systemIntro?: { k: string; v: string }[]

  @ApiPropertyOptional({ description: '系统构造分层' })
  @IsOptional()
  @IsArray()
  layers?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '系统特点' })
  @IsOptional()
  @IsArray()
  features?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '标准色卡' })
  @IsOptional()
  @IsArray()
  colors?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '产品常见问题' })
  @IsOptional()
  @IsArray()
  faqs?: { q: string; a: string }[]

  @ApiPropertyOptional({ description: '列表排序' })
  @IsOptional()
  @IsInt()
  sort?: number

  @ApiPropertyOptional({ description: '状态（published / draft）' })
  @IsOptional()
  @IsString()
  status?: string
}

export class CreateCaseDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiProperty({ description: '案例标题' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({ description: '行业分类 ID（ProductIndustry.id；与 industry 二选一，优先使用）' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  industryId?: string

  @ApiPropertyOptional({ description: '行业分类名（兼容字段：必须精确命中已有分类，未命中返回 400；不接受自由文本）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string

  @ApiPropertyOptional({ description: '业主 / 客户' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client?: string

  @ApiPropertyOptional({ description: '项目地点' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string

  @ApiPropertyOptional({ description: '地坪面积（展示文本）' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  area?: string

  @ApiPropertyOptional({ description: '完成年份（展示文本）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  year?: string

  @ApiPropertyOptional({ description: '使用体系主项' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  system?: string

  @ApiPropertyOptional({ description: '使用体系副项 / 备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  systemNote?: string

  @ApiPropertyOptional({ description: '卡片图片地址' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  img?: string

  @ApiPropertyOptional({ description: '详情页导语' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lead?: string

  @ApiPropertyOptional({ description: '详情页头部标签', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chips?: string[]

  @ApiPropertyOptional({ description: '详情页大图' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bgImage?: string

  @ApiPropertyOptional({ description: '案例正文纯文本（bodyBlocks 为空时的历史回落，按换行拆段）' })
  @IsOptional()
  @IsString()
  body?: string

  @ApiPropertyOptional({
    description: '案例正文结构化块（段落 / 小标题 / 图片 / 表格 / 视频，按顺序渲染）',
    type: [ArticleBlockDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArticleBlockDto)
  bodyBlocks?: ArticleBlockDto[]

  @ApiPropertyOptional({ description: '项目画面（env-grid items）' })
  @IsOptional()
  @IsArray()
  images?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '抓取 / 录入来源页 URL（采集脚本用，手工录入留空）' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceUrl?: string

  @ApiPropertyOptional({ description: 'URL 片段（缺省自动生成 case-YYYYMMDD-序号；创建后不可修改）' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug 只允许小写字母、数字与连字符，且不以连字符开头' })
  slug?: string

  @ApiPropertyOptional({ description: '列表排序（升序）' })
  @IsOptional()
  @IsInt()
  sort?: number
}

export class UpdateCaseDto {
  @ApiPropertyOptional({ description: '案例标题' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional({ description: '行业分类 ID（传空串 = 取消分类）' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  industryId?: string

  @ApiPropertyOptional({ description: '行业分类名（兼容字段：必须精确命中已有分类，未命中返回 400）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string

  @ApiPropertyOptional({ description: '业主 / 客户' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  client?: string

  @ApiPropertyOptional({ description: '项目地点' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string

  @ApiPropertyOptional({ description: '地坪面积' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  area?: string

  @ApiPropertyOptional({ description: '完成年份' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  year?: string

  @ApiPropertyOptional({ description: '使用体系主项' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  system?: string

  @ApiPropertyOptional({ description: '使用体系副项 / 备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  systemNote?: string

  @ApiPropertyOptional({ description: '卡片图片地址' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  img?: string

  @ApiPropertyOptional({ description: '详情页导语' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lead?: string

  @ApiPropertyOptional({ description: '详情页头部标签', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chips?: string[]

  @ApiPropertyOptional({ description: '详情页大图' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bgImage?: string

  @ApiPropertyOptional({ description: '案例正文纯文本（bodyBlocks 为空时的历史回落）' })
  @IsOptional()
  @IsString()
  body?: string

  @ApiPropertyOptional({ description: '案例正文结构化块（传空数组 = 清空为纯文本回落）', type: [ArticleBlockDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArticleBlockDto)
  bodyBlocks?: ArticleBlockDto[]

  @ApiPropertyOptional({ description: '项目画面' })
  @IsOptional()
  @IsArray()
  images?: Record<string, unknown>[]

  @ApiPropertyOptional({ description: '抓取 / 录入来源页 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceUrl?: string

  @ApiPropertyOptional({ description: '列表排序' })
  @IsOptional()
  @IsInt()
  sort?: number

  @ApiPropertyOptional({ description: '状态（published / draft）' })
  @IsOptional()
  @IsString()
  status?: string
}
