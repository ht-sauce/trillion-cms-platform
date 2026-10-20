/**
 * 静态文件模块：上传 / 列表 / 删除
 * 物理存储为服务端 uploads/ 目录，数据库记录 URL，二者解耦便于后续切对象存储
 */
import { Module } from '@nestjs/common'
import { StaticFilesController } from './static-files.controller'
import { StaticFilesService } from './static-files.service'

@Module({
  controllers: [StaticFilesController],
  providers: [StaticFilesService],
  exports: [StaticFilesService]
})
export class StaticFilesModule {}
