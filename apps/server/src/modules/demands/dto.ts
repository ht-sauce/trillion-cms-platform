/**
 * 客户需求模块 DTO：公开提交、后台分页跟进与 IP 封禁入参校验
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Transform } from 'class-transformer'

export const DEMAND_STATUSES = ['pending', 'followed'] as const
export const BAN_SOURCES = ['auto', 'manual'] as const

export class SubmitDemandDto {
  @ApiProperty({ description: '需求描述' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  description: string

  @ApiPropertyOptional({ description: '称呼' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactName?: string

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @ApiPropertyOptional({ description: '微信号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  wechat?: string

  @ApiPropertyOptional({ description: '邮箱' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string

  @ApiPropertyOptional({ description: '其他联系方式' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  otherContact?: string

  @ApiPropertyOptional({ description: '来源页面地址' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceUrl?: string

  @ApiProperty({ description: '客户端提交幂等标识' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  submitKey: string

  @ApiProperty({ description: '验证码挑战 ID' })
  @IsString()
  @MaxLength(64)
  captchaId: string

  @ApiProperty({ description: '验证码答案' })
  @IsString()
  @MaxLength(16)
  captchaCode: string
}

export class QueryDemandDto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number | string

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number | string

  @ApiPropertyOptional({ description: '站点 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  siteId?: string

  @ApiPropertyOptional({ enum: DEMAND_STATUSES })
  @IsOptional()
  @IsIn(DEMAND_STATUSES)
  status?: (typeof DEMAND_STATUSES)[number]

  @ApiPropertyOptional({ description: '需求、称呼或联系方式关键字' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  keyword?: string
}

export class UpdateDemandDto {
  @ApiPropertyOptional({ enum: DEMAND_STATUSES })
  @IsOptional()
  @IsIn(DEMAND_STATUSES)
  status?: (typeof DEMAND_STATUSES)[number]

  @ApiPropertyOptional({ description: '内部跟进备注' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string
}

export class QueryIpBanDto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number | string

  @ApiPropertyOptional()
  @IsOptional()
  pageSize?: number | string

  @ApiPropertyOptional({ description: 'IP 关键字' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string

  @ApiPropertyOptional({ enum: BAN_SOURCES })
  @IsOptional()
  @IsIn(BAN_SOURCES)
  source?: (typeof BAN_SOURCES)[number]
}

export class CreateIpBanDto {
  @ApiProperty({ description: '待封禁 IP' })
  @IsString()
  @MaxLength(64)
  ip: string

  @ApiProperty({ description: '封禁原因' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reason: string
}
