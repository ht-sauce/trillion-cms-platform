/**
 * 新闻/问答管理模块 DTO
 *
 * 管理源是 NewsArticle / FaqItem 独立数据表，本模块的字段即表字段的写入投影：
 * 文章 = title/summary/publishDate/content，问答 = question/category/answer；
 * 正文一律为纯文本，按换行拆段落。slug 创建后不可修改（编辑 DTO 不收 slug）。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
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

  @ApiProperty({ description: '正文纯文本，按换行拆分为段落' })
  @IsString()
  @MinLength(1)
  content: string

  @ApiPropertyOptional({ description: 'URL 片段（缺省自动生成 news-YYYYMMDD-序号；创建后不可修改）' })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug 只允许小写字母、数字与连字符，且不以连字符开头' })
  slug?: string
}

export class UpdateArticleDto {
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

  @ApiPropertyOptional({ description: '发布日期（YYYY-MM-DD，不允许早于今天）' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: '发布日期必须为 YYYY-MM-DD 格式' })
  @Validate(PublishDateNotBeforeTodayConstraint)
  publishDate?: string

  @ApiPropertyOptional({ description: '正文纯文本，按换行拆分为段落' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string
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
