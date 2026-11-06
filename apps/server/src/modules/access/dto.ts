/**
 * 入站访问记录 DTO
 * 记录由 GEO 中间件在响应结束/中断后异步提交；管理端只做筛选与分页查看
 */
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional, OmitType } from '@nestjs/swagger'

export const RESOURCE_TYPES = ['page', 'asset', 'llms', 'sitemap', 'robots', 'payload', 'other'] as const
export const ACCESS_CATEGORIES = ['browser', 'search_bot', 'ai_bot', 'unknown'] as const
export const COMPLETIONS = ['finished', 'aborted'] as const

export class CreateAccessEventDto {
  @ApiPropertyOptional({ description: '站点 ID（Host 已解析时提供；缺失时服务端按 host 兜底解析）' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  siteId?: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(128)
  host: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(512)
  path: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(8)
  method: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(768)
  requestUrl: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  clientIp: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  peerIp: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(512)
  userAgent: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  referer?: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(32)
  browserName: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  browserVersion?: string

  @ApiPropertyOptional()
  @IsIn(RESOURCE_TYPES)
  resourceType: (typeof RESOURCE_TYPES)[number]

  @ApiPropertyOptional()
  @IsIn(ACCESS_CATEGORIES)
  accessCategory: (typeof ACCESS_CATEGORIES)[number]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentToken?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vendor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  status?: number

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  durationMs: number

  @ApiPropertyOptional()
  @IsIn(COMPLETIONS)
  completion: (typeof COMPLETIONS)[number]

  @ApiPropertyOptional({ description: '请求发生时间（ISO 字符串）' })
  @IsString()
  @MaxLength(40)
  occurredAt: string
}

export class QueryAccessEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  siteId?: string

  @ApiPropertyOptional({ description: '起始时间（YYYY-MM-DD HH:mm:ss）' })
  @IsOptional()
  @IsString()
  from?: string

  @ApiPropertyOptional({ description: '结束时间（YYYY-MM-DD HH:mm:ss）' })
  @IsOptional()
  @IsString()
  to?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  path?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(RESOURCE_TYPES)
  resourceType?: (typeof RESOURCE_TYPES)[number]

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(ACCESS_CATEGORIES)
  accessCategory?: (typeof ACCESS_CATEGORIES)[number]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentToken?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value
    const text = value.trim()
    return text === '' ? undefined : /^\d+$/.test(text) ? Number(text) : value
  })
  @IsInt()
  status?: number

  @ApiPropertyOptional()
  @IsOptional()
  page?: number

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number
}

export class QueryAccessSummaryDto extends OmitType(QueryAccessEventDto, ['page', 'pageSize'] as const) {}
