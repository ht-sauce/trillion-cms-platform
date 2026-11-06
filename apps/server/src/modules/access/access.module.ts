/**
 * 入站访问记录模块
 * 数据由 GEO 中间件异步上报；管理后台只读分页查看，不做统计分析
 */
import { Module } from '@nestjs/common'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'
import { GeoIpService } from './geo-ip.service'

@Module({
  controllers: [AccessController],
  providers: [AccessService, GeoIpService],
  exports: [AccessService]
})
export class AccessModule {}
