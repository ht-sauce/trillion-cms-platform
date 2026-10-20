/**
 * 角色模块 DTO：入参校验，写操作字段在此集中定义
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import type { RoleStatus } from '@trillion/shared'

export class QueryRoleDto {
  @ApiPropertyOptional({ description: '状态筛选 active/disabled' })
  @IsOptional()
  @IsString()
  status?: RoleStatus

  @ApiPropertyOptional({ description: '关键字：角色名称/标识' })
  @IsOptional()
  @IsString()
  keyword?: string
}

export class CreateRoleDto {
  @ApiProperty({ description: '角色标识（唯一，代码引用），如 ops_admin' })
  @IsString()
  @MaxLength(32)
  code: string

  @ApiProperty({ description: '角色名称（中文展示）' })
  @IsString()
  @MaxLength(32)
  name: string

  @ApiPropertyOptional({ description: '角色说明' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string

  @ApiPropertyOptional({ description: '是否平台级角色（可执行平台级操作）' })
  @IsOptional()
  @IsBoolean()
  platform?: boolean

  @ApiPropertyOptional({ description: '状态 active/disabled' })
  @IsOptional()
  @IsString()
  status?: RoleStatus

  @ApiPropertyOptional({ description: '排序，升序' })
  @IsOptional()
  @IsInt()
  sort?: number
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class SaveRoleMenusDto {
  @ApiProperty({ description: '该角色可访问的菜单 ID 列表（服务端会自动补全祖先菜单）', type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  menuIds: string[]
}
