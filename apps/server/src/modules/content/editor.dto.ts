/**
 * 站点内容编辑器 DTO（内容树 / 目录 / 页面 / 草稿 / 上下移）
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateChannelDto {
  @ApiProperty()
  @IsString()
  siteId: string

  @ApiPropertyOptional({ description: '上级目录 ID，缺省为一级目录' })
  @IsOptional()
  @IsString()
  parentId?: string | null

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name: string

  @ApiProperty({ description: 'URL 片段（小写字母/数字/连字符）' })
  @IsString()
  @MaxLength(64)
  slug: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort?: number
}

export class UpdateChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  @ApiPropertyOptional({ description: '已发布页面所在目录的 slug 不可修改' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort?: number
}

export class CreatePageDto {
  @ApiProperty()
  @IsString()
  siteId: string

  @ApiProperty()
  @IsString()
  channelId: string

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  title: string

  @ApiProperty({ description: 'URL 片段；首页用 home' })
  @IsString()
  @MaxLength(128)
  slug: string

  @ApiPropertyOptional({ description: 'static / list / detail' })
  @IsOptional()
  @IsIn(['static', 'list', 'detail'])
  kind?: 'static' | 'list' | 'detail'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string

  @ApiPropertyOptional({ description: '摘要，llms.txt 与 meta description 复用' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  summary?: string
}

export class UpdatePageMetaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string

  @ApiPropertyOptional({ description: '已发布页面的 slug 不可修改（400）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  slug?: string

  @ApiPropertyOptional({ description: '已发布页面的所属目录不可修改（400）' })
  @IsOptional()
  @IsString()
  channelId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['static', 'list', 'detail'])
  kind?: 'static' | 'list' | 'detail'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  summary?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoKeywords?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorName?: string

  @ApiPropertyOptional({ description: '页面级 JSON-LD 自定义内容' })
  @IsOptional()
  @IsString()
  jsonLd?: string

  @ApiPropertyOptional({ description: 'auto_append / override' })
  @IsOptional()
  @IsIn(['auto_append', 'override'])
  jsonLdMode?: 'auto_append' | 'override'

  @ApiPropertyOptional({ description: '医疗类内容编审信息' })
  @IsOptional()
  editorial?: Record<string, unknown> | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort?: number
}

export class SaveDraftDto {
  @ApiProperty({ description: '整页草稿快照（后写覆盖）' })
  @IsOptional()
  draft: Record<string, unknown>

  @ApiPropertyOptional({ description: '块实例数组（与草稿一并提交）' })
  @IsOptional()
  @IsArray()
  blocks?: unknown[]
}

export class MoveDto {
  @ApiProperty({ description: 'up=上移 / down=下移' })
  @IsIn(['up', 'down'])
  direction: 'up' | 'down'

  @ApiPropertyOptional({ description: '归属站点 ID（用于站内权限校验）' })
  @IsOptional()
  @IsString()
  siteId?: string
}
