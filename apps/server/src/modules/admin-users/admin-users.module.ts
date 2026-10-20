/**
 * 后台用户模块：用户 CRUD 与「用户 → 角色」绑定，全部限平台级角色
 */
import { Module } from '@nestjs/common'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersService } from './admin-users.service'

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService]
})
export class AdminUsersModule {}
