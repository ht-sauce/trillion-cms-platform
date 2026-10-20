/**
 * 内容模块 DTO
 */
import { PartialType } from '@nestjs/swagger'
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { BlockData, ContentStatus } from '@trillion/shared'

export class CreateChannelDto {
  @ApiProperty()
  @IsString()
  siteId: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string

  @ApiProperty()
  @IsString()
  name: string

  @ApiProperty()
  @IsString()
  slug: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string
}

export class CreatePageDto {
  @ApiProperty()
  @IsString()
  siteId: string

  @ApiProperty()
  @IsString()
  channelId: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string

  @ApiProperty()
  @IsString()
  title: string

  @ApiProperty()
  @IsString()
  slug: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: ContentStatus

  @ApiPropertyOptional({ description: '摘要，llms.txt 复用' })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ description: '结构化 Block 数组' })
  @IsOptional()
  @IsArray()
  blocks?: BlockData[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorName?: string
}

export class UpdatePageDto extends PartialType(CreatePageDto) {}

export class StatusDto {
  @ApiProperty({ description: '目标状态 draft / pending_review / published' })
  @IsString()
  status: ContentStatus
}
