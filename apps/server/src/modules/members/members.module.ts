/**
 * 会员模块：站点会员管理（admin 侧 CRUD）
 * 会员按 siteId 隔离，站点管理员仅可见本站会员
 */
import { Module } from '@nestjs/common'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'

@Module({
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService]
})
export class MembersModule {}
