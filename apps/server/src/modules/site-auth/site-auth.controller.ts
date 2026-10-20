/**
 * 站点会员接口：注册 / 登录 / 校验
 * GEO 项目前端直接调用（静态站通过浏览器 JS 调用本站 member API）
 */
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SiteAuthService } from './site-auth.service'

@ApiTags('站点会员')
@Controller('site-auth')
export class SiteAuthController {
  constructor(private readonly service: SiteAuthService) {}

  @Post('register')
  @ApiOperation({ summary: '会员注册（需带 siteId）' })
  register(@Body() body: { siteId: string; username: string; password: string; nickname?: string }) {
    return this.service.register(body.siteId, body.username, body.password, body.nickname)
  }

  @Post('login')
  @ApiOperation({ summary: '会员登录，返回 JWT-M' })
  login(@Body() body: { siteId: string; username: string; password: string }) {
    return this.service.login(body.siteId, body.username, body.password)
  }

  @Get('verify')
  @ApiOperation({ summary: '校验会员 token' })
  verify(@Query('token') token: string) {
    return this.service.verify(token)
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前会员信息（静态站 islands 组件使用）' })
  me(@Headers('authorization') auth: string) {
    const token = (auth || '').startsWith('Bearer ') ? auth.slice(7) : ''
    return this.service.me(token)
  }
}
