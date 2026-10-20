/**
 * 鉴权接口：登录、获取当前用户
 */
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'
import { AuthService } from './auth.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'

class LoginDto {
  @IsString()
  username: string

  @IsString()
  @MinLength(6)
  password: string
}

@ApiTags('鉴权')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '管理后台登录' })
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password)
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: '获取当前登录用户信息' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.profile(user)
  }
}
