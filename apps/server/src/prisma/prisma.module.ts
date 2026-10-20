/**
 * Prisma 全局模块
 * 以 @Global() 暴露 PrismaService，其余模块无需重复 import
 */
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
