/**
 * 菜单模块 DTO：入参校验，写操作字段在此集中定义
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import type { MenuStatus } from '@trillion/shared'

export class QueryMenuDto {
  @ApiPropertyOptional({ description: '状态筛选 active/disabled' })
  @IsOptional()
  @IsString()
  status?: MenuStatus
}

export class CreateMenuDto {
  @ApiPropertyOptional({ description: '上级菜单 ID；缺省或 null 表示一级菜单' })
  @IsOptional()
  @IsString()
  parentId?: string | null

  @ApiProperty({ description: '菜单名称' })
  @IsString()
  @MaxLength(32)
  title: string

  @ApiPropertyOptional({ description: '路由路径，目录型菜单可留空' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  path?: string | null

  @ApiPropertyOptional({ description: '同级排序，升序' })
  @IsOptional()
  @IsInt()
  sort?: number

  @ApiPropertyOptional({ description: '是否在侧栏可见' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean

  @ApiPropertyOptional({ description: '状态 active/disabled' })
  @IsOptional()
  @IsString()
  status?: MenuStatus
}

export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
