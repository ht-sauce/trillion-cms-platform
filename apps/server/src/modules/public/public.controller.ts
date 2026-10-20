/**
 * 公开只读接口（无鉴权）：站点档案、路由清单、页面详情、站点级 GEO 文档
 *
 * 说明：这些数据最终都会以静态文件形式对公网可见（站点 HTML / robots / sitemap / llms），
 *      因此不引入鉴权；但**只输出 status=published 的内容**，草稿与未发布页面一律不可达。
 */
import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublicService } from './public.service'

@ApiTags('公开数据（GEO 项目专用）')
@Controller('public')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('site/:key')
  @ApiOperation({ summary: '站点档案 + 导航 + 实体（按 slug 或域名）' })
  site(@Param('key') key: string) {
    return this.service.siteConfig(key)
  }

  @Get('routes/:key')
  @ApiOperation({ summary: '已发布页面清单（含内容指纹与块引用，SSG 路由与产物清单来源）' })
  routes(@Param('key') key: string, @Query('ids') ids?: string) {
    const onlyIds = ids ? ids.split(',').filter(Boolean) : undefined
    return this.service.routes(key, onlyIds)
  }

  @Get('page/:key')
  @ApiOperation({ summary: '页面详情（含结构化 Block 与渲染上下文原料）' })
  page(@Param('key') key: string, @Query('path') path: string) {
    return this.service.pageDetail(key, path || '/')
  }

  @Get('documents/:key')
  @ApiOperation({ summary: '站点级 GEO 文档（robots.txt / sitemap.xml / llms.txt）' })
  documents(@Param('key') key: string) {
    return this.service.documents(key)
  }

  @Get('robots/:key')
  @ApiOperation({ summary: 'robots.txt 内容（兼容旧端点）' })
  robots(@Param('key') key: string) {
    return this.service.robots(key)
  }

  @Get('entities/:key')
  @ApiOperation({ summary: '站点实体清单' })
  entities(@Param('key') key: string) {
    return this.service.entities(key)
  }
}
