/**
 * 新闻/问答管理模块 DTO
 *
 * 管理源是 NewsArticle / FaqItem 独立数据表，本模块的字段即表字段的写入投影：
 * 文章 = title/summary/publishDate/content/body，问答 = question/category/answer；
 * 问答正文一律为纯文本按换行拆段落；文章正文以结构化块 body（段落/小标题/图片）为准，
 * content 是它的纯文本派生列（历史数据仍只读 content）。slug 创建后不可修改（编辑 DTO 不收 slug）。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator'
import { todayInChina } from '../../common/utils/datetime'

/** 发布日期（YYYY-MM-DD）校验用的正则 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** URL 片段校验（与 common/utils/site-path 的 isValidPathSegment 同口径） */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** 发布日期不允许早于今天（Asia/Shanghai 口径取当天；格式错误由 @Matches 先行拦截） */
@ValidatorConstraint({ name: 'publishDateNotBeforeToday', async: false })
export class PublishDateNotBeforeTodayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return true
    return value >= todayInChina()
  }

  defaultMessage(): string {
    return '发布日期不能早于今天'
  }
}

/**
 * 正文块（段落 / 小标题 / 图片，ADR-053）
 * 白名单字段；图片地址的合法性（只认 /static、/assets、http(s)）在
 * common/utils/article-body 的 normalizeArticleBody 里二次收口
 */
export class ArticleBlockDto {
  @ApiProperty({ description: '块类型：paragraph=段落 / heading=小标题 / image=图片' })
  @IsIn(['paragraph', 'heading', 'image'])
  kind: 'paragraph' | 'heading' | 'image'

  @ApiPropertyOptional({ description: '段落或小标题文本' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string

  @ApiPropertyOptional({ description: '图片地址（素材库 publicUrl，/static/... 形态）' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  src?: string

  @ApiPropertyOptional({ description: '图片替代文本' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string

  @ApiPropertyOptional({ description: '图片说明（渲染为 figcaption）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string

  @ApiPropertyOptional({ description: '小标题层级（2~4，缺省 2）' })
  @IsOptional()
  @IsInt()
  level?: number
}

export class CreateArticleDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiProperty({ description: '文章标题' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({ description: '摘要（缺省取正文首段截断）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string

  @ApiProperty({ description: '发布日期（YYYY-MM-DD，不允许早于今天）' })
  @IsString()
  @Matches(DATE_PATTERN, { message: '发布日期必须为 YYYY-MM-DD 格式' })
  @Validate(PublishDateNotBeforeTodayConstraint)
  publishDate: string

  @ApiPropertyOptional({ description: '正文纯文本（body 的派生列；body 为空时才以此为准，按换行拆段）' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ description: '正文结构化块（段落 / 小标题 / 图片，按顺序渲染）', type: [ArticleBlockDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArticleBlockDto)
  body?: ArticleBlockDto[]

  @ApiPropertyOptional({ description: '封面图（素材库 publicUrl，/static/... 形态；详情页首屏背景）' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cover?: string

  @ApiPropertyOptional({ description: 'URL 片段（缺省自动生成；创建后不可修改）' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug 只允许小写字母、数字与连字符，且不以连字符开头' })
  slug?: string
}

export class UpdateArticleDto {
  @ApiPropertyOptional({ description: '封面图（素材库 publicUrl）' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cover?: string

  @ApiPropertyOptional({ description: '文章标题' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @ApiPropertyOptional({ description: '摘要' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string

  @ApiPropertyOptional({ description: '发布日期（YYYY-MM-DD；编辑既有日期不受「不早于今天」约束）' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: '发布日期必须为 YYYY-MM-DD 格式' })
  publishDate?: string

  @ApiPropertyOptional({ description: '正文纯文本（body 的派生列）' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ description: '正文结构化块（段落 / 小标题 / 图片）', type: [ArticleBlockDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArticleBlockDto)
  body?: ArticleBlockDto[]
}

export class CreateFaqDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiProperty({ description: '问题' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  question: string

  @ApiProperty({ description: '分类' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category: string

  @ApiProperty({ description: '答案纯文本，按换行拆分为段落' })
  @IsString()
  @MinLength(1)
  answer: string
}

export class UpdateFaqDto {
  @ApiPropertyOptional({ description: '问题' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  question?: string

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string

  @ApiPropertyOptional({ description: '答案纯文本，按换行拆分为段落' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  answer?: string
}
