/**
 * 全局公共模块
 * JWT 服务被 AdminAuthGuard / SiteAuthGuard 等守卫依赖，而这些守卫挂在各个业务模块上，
 * 若每个业务模块都自行 import JwtModule 会造成大量重复注册。
 * 这里把 JwtModule 注册一次并声明为全局导出，业务模块只需使用守卫即可。
 */
import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { jwtExpiresIn } from './utils/jwt-expiry'

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: jwtExpiresIn(config.get<string>('jwt.expiresIn')) }
      })
    })
  ],
  exports: [JwtModule]
})
export class CommonModule {}
