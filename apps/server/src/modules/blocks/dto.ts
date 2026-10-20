/**
 * 块定义模块 DTO
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

export class CreateBlockDto {
  @ApiPropertyOptional({ description: "归属站点 ID（写入时 '0' 视为公共块；scope=public 时忽略）" })
  @IsOptional()
  @IsString()
  siteId?: string

  @ApiProperty({ description: '归属：public=全站可用 / site=本站私有' })
  @IsIn(['public', 'site'])
  scope: 'public' | 'site'

  @ApiProperty({ description: 'Vue SFC 源码（含 defineBlock 声明）' })
  @IsString()
  code: string
}

export class SaveBlockCodeDto {
  @ApiPropertyOptional({ description: '归属站点 ID（用于定位站点私有块）' })
  @IsOptional()
  @IsString()
  siteId?: string

  @ApiProperty({ description: 'Vue SFC 源码（含 defineBlock 声明）' })
  @IsString()
  code: string
}

export class RollbackBlockDto {
  @ApiPropertyOptional({ description: '归属站点 ID' })
  @IsOptional()
  @IsString()
  siteId?: string
}

export class ApplyBlockDto {
  @ApiProperty({ description: '目标站点 ID（把公共模板复制为本站自有块）' })
  @IsString()
  siteId: string
}
