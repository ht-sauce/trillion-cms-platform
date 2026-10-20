/**
 * 埋点与 AI 爬虫监控模块
 * 埋点数据由 GEO 项目 sendBeacon 上报；AI 抓取数据由 nginx 日志采集器或 llms.txt 动态返回时写入
 */
import { Module } from '@nestjs/common'
import { TrackController } from './track.controller'
import { TrackService } from './track.service'

@Module({
  controllers: [TrackController],
  providers: [TrackService],
  exports: [TrackService]
})
export class TrackModule {}
