/**
 * 鉴权模块：管理后台登录（JWT-A）与当前用户信息
 * JwtService 由全局 CommonModule 提供，这里不再重复注册
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CommonModule } from '../../common/common.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [ConfigModule, CommonModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
