/**
 * 站点会员鉴权模块（JWT-M）
 * 与 admin 的 JWT-A 完全独立：不同密钥、不同载荷、token 互不通用
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { SiteAuthController } from './site-auth.controller'
import { SiteAuthService } from './site-auth.service'

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // 会员 token 使用独立密钥，后缀 _MEMBER 便于区分
        secret: `${config.get<string>('jwt.secret')}_MEMBER`,
        signOptions: { expiresIn: '30d' }
      })
    })
  ],
  controllers: [SiteAuthController],
  providers: [SiteAuthService],
  exports: [SiteAuthService]
})
export class SiteAuthModule {}
