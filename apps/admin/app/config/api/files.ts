/**
 * 静态文件接口
 */
import { get, upload, request, del, type Paged } from './http'

export interface StaticFileItem {
  id: string
  siteId: string | null
  originalName: string
  storagePath: string
  publicUrl: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  /** 图片备注（标识素材引用位置） */
  caption: string | null
  createdAt: string
}

/** 素材库仅收常用图片格式：文件选择器 accept 与上传前置校验共用（与服务端 ALLOWED_MIME 口径一致） */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/x-icon'
export const IMAGE_MIMES = IMAGE_ACCEPT.split(',')

export const filesApi = {
  /** 上传文件：服务端基址（含 /geoserver 全局前缀）已由 http 层统一，此处路径为 /files/upload */
  upload(file: File, siteId?: string, caption?: string) {
    const form = new FormData()
    form.append('file', file)
    if (siteId) form.append('siteId', String(siteId))
    if (caption) form.append('caption', caption)
    return upload<StaticFileItem>('/files/upload', form)
  },
  list(params: { siteId?: string; keyword?: string; page?: number; pageSize?: number } = {}) {
    return get<Paged<StaticFileItem>>('/files', params as Record<string, unknown>)
  },
  /** 更新图片备注（标识素材引用位置），空串即清空 */
  async updateCaption(id: string, caption: string) {
    return request<StaticFileItem>(`/files/${id}/caption`, { method: 'PATCH', body: { caption } })
  },
  /** 替换素材内容：引用地址（publicUrl）保持不变，multipart 字段名 file */
  replace(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<StaticFileItem>(`/files/${id}/replace`, { method: 'PUT', body: form })
  },
  remove(id: string) {
    return del<{ id: string }>(`/files/${id}`)
  }
}
