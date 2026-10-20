/**
 * GEO 元数据接口（纯计算、不落盘）
 * 后台「双模式」编辑器据此只读展示「实际会输出的内容」，并支持以自动结果为基础编辑
 */
import { post } from './http'
import type { GeoPreviewInput, GeoPreviewResult } from '@trillion/shared'

/** 预览目标（与服务端 GeoPreviewTarget 一致） */
export type GeoPreviewTarget = GeoPreviewInput['target']

/** 预览入参（siteId + target 必填，其余按目标可选） */
export type GeoPreviewPayload = GeoPreviewInput

export const geoApi = {
  /**
   * GEO 文档生成预览
   * @returns auto = 系统自动生成内容；output = 按 mode 拼接后实际会输出的内容
   */
  preview(payload: GeoPreviewPayload) {
    return post<GeoPreviewResult>('/geo/preview', payload)
  }
}
