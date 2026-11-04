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
  /** 上传来源（哪个功能 / 哪个页面传上来的，如「新闻正文 · 某标题」「站点设置 · 站点图标」） */
  source: string | null
  createdAt: string
}

/** 素材库收常用图片格式：文件选择器 accept 与上传前置校验共用（与服务端 ALLOWED_MIME 口径一致） */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,image/x-icon'
export const IMAGE_MIMES = IMAGE_ACCEPT.split(',')
/** 正文可嵌入的视频格式（服务端 ALLOWED_MIME 同口径） */
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime'
export const VIDEO_MIMES = VIDEO_ACCEPT.split(',')
/** 素材库上传入口同时收图片与视频 */
export const MEDIA_ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`

/** 体积上限（与服务端校验一致）：图片 2MB / 视频 100MB */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024

/** 上传参数：siteId 归属站点、caption 备注、source 上传来源 */
export interface UploadOptions {
  siteId?: string
  caption?: string
  /** 上传来源（哪个功能 / 哪个页面），写进 StaticFile.source 供素材库追溯 */
  source?: string
}

export const filesApi = {
  /** 上传文件：服务端基址（含 /geoserver 全局前缀）已由 http 层统一，此处路径为 /files/upload */
  upload(file: File, options: UploadOptions = {}) {
    const form = new FormData()
    form.append('file', file)
    if (options.siteId) form.append('siteId', String(options.siteId))
    if (options.caption) form.append('caption', options.caption)
    if (options.source) form.append('source', options.source)
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
