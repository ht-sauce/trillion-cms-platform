/**
 * 渲染引擎内部接口：块代码清单
 *
 * 用途：GEO 项目（渲染引擎）在「构建前」与「预览请求前」拉取本站全部块代码，
 *      落盘到 apps/geo/.blocks/Blk<PascalKey>.vue 供动态解析渲染（见 09 §4.3）。
 *
 * 鉴权：请求头 `x-internal-token` 必须等于环境变量 INTERNAL_API_TOKEN。
 *      未配置该变量时视为本地开发环境，放行（生产必须配置）。
 */
import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { BlocksService } from './blocks.service'
import { PublicService } from '../public/public.service'

@ApiTags('内部接口（渲染引擎专用）')
@Controller('internal')
export class BlocksInternalController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly config: ConfigService,
    private readonly publicService: PublicService
  ) {}

  @Get('blocks')
  @ApiOperation({ summary: '本站块代码清单（渲染引擎落盘 .blocks/ 用）' })
  async manifest(
    @Headers('x-internal-token') token: string,
    @Query('siteId') siteId?: string,
    @Query('site') site?: string
  ) {
    this.assertToken(token)
    const resolvedSiteId = siteId || (await this.resolveSiteId(site))
    if (!resolvedSiteId) throw new UnauthorizedException('缺少 siteId 或 site 参数')
    return this.blocks.rendererManifest(resolvedSiteId)
  }

  private assertToken(token: string) {
    const expected = this.config.get<string>('internalToken')
    if (!expected) return
    if (token !== expected) throw new UnauthorizedException('内部令牌无效')
  }

  /** 允许按站点标识（slug/域名）反查，便于构建脚本直接用 slug 调用 */
  private async resolveSiteId(siteKey?: string): Promise<string | null> {
    if (!siteKey) return null
    const site = await this.publicService.siteConfig(siteKey)
    return site.id
  }
}
