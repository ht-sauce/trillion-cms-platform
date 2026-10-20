/**
 * GEO 元数据模块：JSON-LD / llms.txt / head 扩展 / robots meta 的只读预览
 */
import { Module } from '@nestjs/common'
import { GeoController } from './geo.controller'
import { GeoService } from './geo.service'
import { PublicModule } from '../public/public.module'

@Module({
  imports: [PublicModule],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService]
})
export class GeoModule {}
