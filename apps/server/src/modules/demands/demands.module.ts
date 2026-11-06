/**
 * 客户需求模块：公开收集入口与受菜单授权保护的后台跟进能力
 */
import { Module } from '@nestjs/common'
import { CaptchaService } from './captcha.service'
import { DemandsController } from './demands.controller'
import { DemandsService } from './demands.service'
import { RateLimitService } from './rate-limit.service'

@Module({
  controllers: [DemandsController],
  providers: [DemandsService, CaptchaService, RateLimitService],
  exports: [DemandsService]
})
export class DemandsModule {}
