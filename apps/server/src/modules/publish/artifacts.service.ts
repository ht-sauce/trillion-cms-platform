/**
 * 产物清单（sites/<slug>/_trillion.json）读写与徽标派生
 *
 * 定位（09 §8.2）：产物清单是「页面 ↔ 产物」对应关系的**唯一事实来源**（文件形态）。
 * 徽标派生：
 *   Page.contentHash === Page.publishedHash === 清单该页 contentHash → 已发布
 *   不等（或有内容改动 / 块代码变更牵连）                          → 待发布
 *   清单中不存在该 pageId                                          → 产物缺失
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ArtifactManifest, ArtifactPageEntry, ContentBadge } from '@trillion/shared'

@Injectable()
export class ArtifactsService {
  constructor(private readonly config: ConfigService) {}

  /** 站点产物根目录（sites/） */
  sitesRoot(): string {
    const dir = this.config.get<string>('build.sitesOutputDir') || '../geo/sites'
    return path.resolve(process.cwd(), dir)
  }

  /** 站点产物目录 */
  siteDir(slug: string): string {
    return path.join(this.sitesRoot(), slug)
  }

  /** 读取产物清单（不存在或损坏返回 null） */
  readManifest(slug: string): ArtifactManifest | null {
    const file = path.join(this.siteDir(slug), '_trillion.json')
    try {
      if (!fs.existsSync(file)) return null
      return JSON.parse(fs.readFileSync(file, 'utf8')) as ArtifactManifest
    } catch {
      return null
    }
  }

  /** 清单内某页条目 */
  pageEntry(slug: string, pageId: string): ArtifactPageEntry | null {
    const manifest = this.readManifest(slug)
    return manifest?.pages.find((item) => item.pageId === pageId) ?? null
  }

  /** 最近一次构建时间（发布确认弹窗展示「当前线上版本时间」） */
  lastBuiltAt(slug: string): string | null {
    return this.readManifest(slug)?.generatedAt ?? null
  }

  /**
   * 派生页面徽标
   * @param contentHash 页面当前内容指纹
   * @param publishedHash 页面上次发布指纹
   */
  badge(slug: string, pageId: string, contentHash: string, publishedHash: string): ContentBadge {
    const entry = this.pageEntry(slug, pageId)
    if (!entry) return 'missing'
    const current = contentHash || ''
    return entry.contentHash === current && current === (publishedHash || '') ? 'published' : 'pending'
  }

  /** 列举产物目录下的全部文件（相对路径），供打包下载使用 */
  listFiles(slug: string, options: { includeClientAssets: boolean }): { relative: string; absolute: string }[] {
    const root = this.siteDir(slug)
    const result: { relative: string; absolute: string }[] = []
    if (!fs.existsSync(root)) return result

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name)
        const relative = path.relative(root, absolute).split(path.sep).join('/')
        if (entry.isDirectory()) {
          // html 模式排除客户端资源目录（CDN 回源场景，见 09 §8.5）
          if (!options.includeClientAssets && (relative === '_nuxt' || relative.startsWith('_nuxt/'))) continue
          walk(absolute)
        } else {
          if (!options.includeClientAssets && (relative === '_payload.json' || relative.endsWith('_payload.json'))) {
            continue
          }
          result.push({ relative, absolute })
        }
      }
    }

    walk(root)
    return result
  }

  /** 站点是否已有产物 */
  hasArtifacts(slug: string): boolean {
    return fs.existsSync(path.join(this.siteDir(slug), 'index.html'))
  }
}
