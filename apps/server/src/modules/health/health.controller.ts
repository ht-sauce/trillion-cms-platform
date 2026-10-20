/**
 * 健康检查接口（供 Docker healthcheck 与运维探测使用）
 */
import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { HealthService } from './health.service'

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get()
  @ApiOperation({ summary: '服务与数据库健康状态' })
  check() {
    return this.service.check()
  }
}
