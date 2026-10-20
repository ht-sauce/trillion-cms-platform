/**
 * 健康检查：数据库连接状态与运行指标
 */
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

@Module({
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
