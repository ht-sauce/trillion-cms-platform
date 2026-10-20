/**
 * 后台用户模块 DTO：入参校验，写操作字段在此集中定义
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class QueryAdminUserDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  page?: number

  @ApiPropertyOptional({ description: '每页条数' })
  @IsOptional()
  pageSize?: number

  @ApiPropertyOptional({ description: '关键字：账号/展示名称' })
  @IsOptional()
  @IsString()
  keyword?: string

  @ApiPropertyOptional({ description: '按角色筛选' })
  @IsOptional()
  @IsString()
  roleId?: string
}

export class CreateAdminUserDto {
  @ApiProperty({ description: '登录账号' })
  @IsString()
  @MaxLength(32)
  username: string

  @ApiProperty({ description: '登录密码（≥6 位）' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password: string

  @ApiPropertyOptional({ description: '展示名称' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string

  @ApiProperty({ description: '绑定角色 ID' })
  @IsString()
  roleId: string

  @ApiPropertyOptional({ description: '授权站点 ID 列表（平台级角色可留空表示全站点）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  siteIds?: string[]

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ description: '登录密码（留空表示不修改）' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password?: string

  @ApiPropertyOptional({ description: '展示名称' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string

  @ApiPropertyOptional({ description: '绑定角色 ID' })
  @IsOptional()
  @IsString()
  roleId?: string

  @ApiPropertyOptional({ description: '授权站点 ID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  siteIds?: string[]

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
