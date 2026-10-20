/**
 * 角色模块：角色 CRUD 与角色-菜单授权，全部限平台级角色
 */
import { Module } from '@nestjs/common'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService]
})
export class RolesModule {}
