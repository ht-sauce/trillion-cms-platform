/**
 * 发布接口：页面级增量发布、整站重建、任务列表
 */
import { ElMessage } from 'element-plus'
import { clearToken, currentRoutePath, get, getToken, post, put, resolveApiBase } from './http'

export interface PublishTask {
  id: string
  siteId: string
  /** 发布范围：page=页面级增量 / site=整站重建（数据库列名为 type，属性名以服务端 scope 为准） */
  scope: 'page' | 'site'
  status: 'pending' | 'running' | 'success' | 'failed'
  log: string | null
  /** 北京时间字符串（服务端已格式化） */
  createdAt: string
  finishedAt: string | null
}

/**
 * 最新构建任务摘要（构建状态与按钮锁定的数据来源）
 * 来自 `GET /publish/artifacts/:siteId` 的 `task` 与 `GET /sites` 的 `build`；`null` = 从未构建
 */
export interface BuildTask {
  id: string
  scope: 'page' | 'site'
  status: 'pending' | 'running' | 'success' | 'failed'
  createdAt: string
  finishedAt: string | null
  /** 构建日志（失败原因在末尾，展示时截尾） */
  log: string | null
}

/** 产物页面状态：已发布 / 待发布（内容指纹与产物不一致）/ 产物缺失 */
export type ArtifactPageStatus = 'published' | 'pending' | 'missing'

/** 产物清单中的页面条目 */
export interface ArtifactPage {
  id: string
  path: string
  title: string
  kind: string
  contentHash: string
  status: ArtifactPageStatus
  /** 线上产物时间（缺失时为 null） */
  onlineAt: string | null
}

/** 站点产物状态（逐页徽标的唯一数据来源） */
export interface ArtifactSummary {
  siteId: string
  slug: string
  hasArtifacts: boolean
  lastBuiltAt: string | null
  buildId: string | null
  routeCount: number
  /** 最新构建任务（编辑器构建状态与按钮锁定看它，见 06 §1.1） */
  task: BuildTask | null
  pages: ArtifactPage[]
}

/** 站点级 GEO 产物文件条目（robots.txt / sitemap.xml / llms.txt，读已构建产物） */
export interface GeoArtifactDoc {
  key: 'robots' | 'sitemap' | 'llms'
  file: string
  description: string
  exists: boolean
  /** 字节数 */
  size: number
  /** 文件更新时间（北京时间串；缺失为 null） */
  updatedAt: string | null
  content: string
}

/** 站点 GEO 产物内容（`GET /publish/geo-docs/:siteId`） */
export interface GeoDocsSummary {
  siteId: string
  slug: string
  hasArtifacts: boolean
  /** 最近一次构建时间（产物清单 generatedAt） */
  generatedAt: string | null
  documents: GeoArtifactDoc[]
}

export const publishApi = {
  publishPage(siteId: string, pageIds: string[]) {
    return post<PublishTask>(`/publish/page/${siteId}`, { pageIds })
  },
  rebuildSite(siteId: string) {
    return post<PublishTask>(`/publish/site/${siteId}`)
  },
  tasks(siteId?: string) {
    return get<PublishTask[]>('/publish/tasks', siteId ? { siteId } : {})
  },
  /** 产物状态（页面级徽标由它派生） */
  artifacts(siteId: string) {
    return get<ArtifactSummary>(`/publish/artifacts/${siteId}`)
  },
  /** 站点 GEO 产物内容（robots.txt / sitemap.xml / llms.txt，读取已构建产物文件本身） */
  geoDocs(siteId: string) {
    return get<GeoDocsSummary>(`/publish/geo-docs/${siteId}`)
  },
  /**
   * 手动替换站点 GEO 产物文件（非常规兜底，一般用不到）：
   * 直接写入产物文件，下次 GEO 索引更新 / 重建会按自动口径重新生成并覆盖
   */
  saveGeoDoc(siteId: string, key: GeoArtifactDoc['key'], content: string) {
    return put<{ file: string; updatedAt: string }>(`/publish/geo-docs/${siteId}`, { key, content })
  },
  /** 回退上一版（只回退产物，不动数据库内容，页面随即变为待发布） */
  rollback(siteId: string, pageId: string) {
    return post<{ pageId: string }>('/publish/rollback', { siteId, pageId })
  },
  /** GEO 索引更新（界面口径；只重生成 robots / sitemap / llms / 清单路由，不重渲染页面） */
  repair(siteId: string) {
    return post<{ siteId: string }>('/publish/repair', { siteId })
  },
  /**
   * 站点产物下载（zip）
   * mode=full 可直接托管；mode=html 仅 HTML 与 GEO 产物
   *
   * 不走 `request()`：产物是二进制流而非统一响应结构，这里自行带 token 取 Blob 后交给浏览器落盘；
   * 但错误分支（如「尚未构建产物」的 400）仍按统一响应结构解析并提示
   */
  async download(siteId: string, mode: 'full' | 'html' = 'full'): Promise<void> {
    const base = resolveApiBase()
    let blob: Blob
    try {
      blob = await $fetch<Blob>(`${base}/publish/download/${siteId}?mode=${mode}`, {
        method: 'GET',
        responseType: 'blob',
        headers: { Authorization: `Bearer ${getToken()}` }
      })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; data?: Blob }
      if (err?.statusCode === 401) {
        clearToken()
        if (import.meta.client && !currentRoutePath().startsWith('/login')) {
          navigateTo('/login')
        }
        throw error
      }
      /** 错误响应体在 blob 模式下也是 Blob，需自行还原统一响应结构取 message */
      let message = '下载失败'
      if (err?.data instanceof Blob) {
        try {
          message = (await err.data.json()).message || message
        } catch {
          /** 非 JSON 错误体，用默认文案 */
        }
      }
      ElMessage.error(message)
      throw error
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `site-${siteId}-${mode}.zip`
    link.click()
    URL.revokeObjectURL(url)
  }
}
