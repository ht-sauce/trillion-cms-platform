/**
 * 健康服务：数据库连通性检测
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', db: true }
    } catch (error) {
      return { status: 'error', db: false, message: (error as Error).message }
    }
  }
}
