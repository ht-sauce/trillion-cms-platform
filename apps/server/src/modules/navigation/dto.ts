/**
 * 导航模块 DTO
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'

export class NavigationItemInputDto {
  @ApiProperty({ description: '链接文案' })
  @IsString()
  @MaxLength(64)
  label: string

  @ApiPropertyOptional({ description: '关联页面 ID（站内跳转）' })
  @IsOptional()
  @IsString()
  pageId?: string | null

  @ApiPropertyOptional({ description: '外部链接或自定义地址（与 pageId 二选一）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  href?: string | null

  @ApiPropertyOptional({ description: 'active=启用 / disabled=停用' })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled'
}

export class SaveNavigationDto {
  @ApiProperty({ description: '站点 ID' })
  @IsString()
  siteId: string

  @ApiPropertyOptional({ description: '分组展示名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string

  @ApiProperty({ description: '导航项列表（整组全量覆盖）', type: [NavigationItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NavigationItemInputDto)
  items: NavigationItemInputDto[]
}
