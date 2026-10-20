/**
 * 数据回填：把既有数据升级到「站点内容编辑器 + 块代码化」的新口径（幂等，可重复执行）
 *
 * 四件事：
 *   1) Channel.path / Page.path 物化（按 parentId + slug 推导；首页 slug=home 映射为 /）
 *   2) Page.blocks 旧形态 `{ type, ... }` 升级为 BlockInstance `{ id, key, enabled, data }`
 *   3) Page.contentHash / publishedHash 计算填充（徽标判定基础）
 *   4) **块副本**：把各站点页面引用到的公共块复制成本站自有块（09 §4.5 块隔离）
 *
 * 执行：pnpm db:backfill（= node scripts/exec.mjs server prisma:backfill）
 * 说明：schema 本身不经 prisma migrate（Windows 下 lower_case_table_names=1 会让外键漂移误报），
 *      改 schema 走 prisma db push --accept-data-loss；本脚本只负责数据侧升级。
 */
import { createHash, randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { copyTemplatesToSite } from '../src/modules/blocks/block-copy'

const prisma = new PrismaClient()

/** 从页面 blocks JSON 里取出块标识（形态容错，非法项忽略） */
function readBlockKeys(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return []
  return blocks.map((item) => String((item as { key?: string } | null)?.key || '')).filter(Boolean)
}

/** 生成块实例 ID（b_ + 12 位十六进制） */
function blockId(): string {
  return `b_${randomBytes(6).toString('hex')}`
}

/** 稳定序列化 */
function stable(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function hash(payload: unknown): string {
  return createHash('sha1').update(stable(payload)).digest('hex').slice(0, 16)
}

/** 旧块类型 → 新块 key 与数据映射（示例数据一次性升级用） */
function upgradeBlock(raw: Record<string, unknown>): {
  id: string
  key: string
  enabled: boolean
  data: Record<string, unknown>
} {
  const type = String(raw.type ?? '')
  const base = { id: blockId(), enabled: true }

  switch (type) {
    case 'hero':
      return {
        ...base,
        key: 'hero-dark',
        data: {
          eyebrow: '',
          h1: String(raw.title ?? ''),
          lead: String(raw.subtitle ?? ''),
          chips: [],
          actions: raw.buttonText
            ? [{ label: String(raw.buttonText), href: String(raw.buttonUrl ?? '#'), variant: 'primary' }]
            : []
        }
      }
    case 'faq': {
      const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : []
      return {
        ...base,
        key: 'faq-list',
        data: {
          items: items.map((item) => ({ q: String(item.question ?? ''), a: String(item.answer ?? '') })),
          columns: 1
        }
      }
    }
    case 'imageList': {
      const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : []
      return {
        ...base,
        key: 'gallery',
        data: {
          items: items.map((item) => ({
            imageUrl: '',
            caption: String(item.title ?? ''),
            location: '',
            takenAt: '',
            imageNo: ''
          }))
        }
      }
    }
    case 'contact':
      return { ...base, key: 'visit-cards', data: { title: String(raw.title ?? '就诊信息') } }
    case 'text': {
      const paragraphs = Array.isArray(raw.paragraphs) ? (raw.paragraphs as unknown[]) : []
      return {
        ...base,
        key: 'article-body',
        data: {
          blocks: [
            ...(raw.heading ? [{ type: 'h2', text: String(raw.heading) }] : []),
            ...paragraphs.map((p) => ({ type: 'p', text: String(p) }))
          ],
          sidebar: { editorial: null, related: [] },
          disclaimer: ''
        }
      }
    }
    default:
      return { ...base, key: type || 'unknown-block', data: raw }
  }
}

/** 升级 blocks JSON（已是新形态则原样返回） */
function upgradeBlocks(blocks: unknown): { changed: boolean; value: unknown[] } {
  if (!Array.isArray(blocks)) return { changed: false, value: [] }
  let changed = false
  const value = blocks.map((item) => {
    const record = (item ?? {}) as Record<string, unknown>
    if (typeof record.key === 'string' && record.data !== undefined) return record
    changed = true
    return upgradeBlock(record)
  })
  return { changed, value }
}

async function main() {
  process.env.TZ = process.env.TZ || 'Asia/Shanghai'

  const sites = await prisma.site.findMany()
  let channelTouched = 0
  let pageTouched = 0
  let blockTouched = 0
  let blockCopied = 0
  /** 地址物化冲突（同站点两个页面推导出同一地址）：只报告不处理，交人工确认归属 */
  const collisions: string[] = []

  for (const site of sites) {
    // ---------- 1) Channel.path 物化 ----------
    const channels = await prisma.channel.findMany({ where: { siteId: site.id } })
    const channelById = new Map(channels.map((c) => [c.id, c]))
    const pathOf = (channelId: string, seen = new Set<string>()): string => {
      const channel = channelById.get(channelId)
      if (!channel || seen.has(channelId)) return ''
      seen.add(channelId)
      if (!channel.parentId) return `/${channel.slug}`
      const parentPath = pathOf(channel.parentId, seen)
      return parentPath ? `${parentPath}/${channel.slug}` : `/${channel.slug}`
    }

    for (const channel of channels) {
      const path = pathOf(channel.id)
      if (channel.path !== path) {
        await prisma.channel.update({ where: { id: channel.id }, data: { path } })
        channelTouched += 1
      }
    }

    // ---------- 2) Page.path 物化 + 块升级 ----------
    const channelPathById = new Map(channels.map((c) => [c.id, pathOf(c.id)]))
    const pages = await prisma.page.findMany({ where: { siteId: site.id } })
    /** 已占用路径 → 页面 id：先放入本站现有路径，避免把页面搬到同站点另一页面的地址上 */
    const pathOwner = new Map<string, string>()
    for (const page of pages) if (page.path) pathOwner.set(page.path, page.id)

    for (const page of pages) {
      const channelPath = channelPathById.get(page.channelId) || ''
      /**
       * 地址口径（与 editor.service / bootstrap 的物化规则一致）：
       *   slug = home   → 站点首页，映射为 `/`
       *   slug = index  → 目录索引页，地址就等于该目录（`/doctors` 而不是 `/doctors/index`）
       *   其余          → 目录地址 + slug
       * ⚠️ 不能把 `index` 也当成首页：一个站点每个目录都有一个 `index` 页，全会撞到 `/`（Page 的 `[siteId, path]` 唯一约束）
       */
      const path =
        page.slug === 'home'
          ? '/'
          : page.slug === 'index'
            ? channelPath || '/'
            : channelPath
              ? `${channelPath}/${page.slug}`
              : `/${page.slug}`

      const holder = pathOwner.get(path)
      if (holder && holder !== page.id) {
        /** 目标路径已被同站点另一页面占用：不抢占、不静默改动归属，报出来交给人工清理 */
        collisions.push(`page=${page.id}（${page.slug}）→ ${path} 已被 page=${holder} 占用`)
        continue
      }
      pathOwner.set(path, page.id)
      if (page.path && page.path !== path) pathOwner.delete(page.path)

      const { changed, value } = upgradeBlocks(page.blocks)
      if (changed) blockTouched += 1

      const data: Record<string, unknown> = { path, blocks: value as never }

      // ---------- 3) 内容指纹 ----------
      const codeHashOf = () => ''
      const contentHash = hash({
        title: page.title,
        slug: page.slug,
        path,
        kind: page.kind,
        summary: page.summary,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        seoKeywords: page.seoKeywords,
        authorName: page.authorName,
        editorial: page.editorial,
        blocks: (value as Record<string, unknown>[]).map((b) => ({
          id: b.id,
          key: b.key,
          enabled: b.enabled ?? true,
          data: b.data,
          codeHash: codeHashOf()
        }))
      })
      data.contentHash = page.publishedHash ? page.contentHash || contentHash : contentHash

      if (page.path !== path || changed || !page.contentHash) {
        await prisma.page.update({ where: { id: page.id }, data })
        pageTouched += 1
      }
    }

    // ---------- 4) 块副本：站点引用到的公共块 → 站点自有块 ----------
    const usedKeys = pages.flatMap((page) => [
      ...readBlockKeys(page.blocks),
      ...readBlockKeys((page.draft as { blocks?: unknown } | null)?.blocks)
    ])
    if (usedKeys.length) {
      const copied = await copyTemplatesToSite(prisma, site.id, usedKeys)
      blockCopied += copied.copied
    }
  }

  console.log(
    `回填完成：站点 ${sites.length} 个 · 目录路径 ${channelTouched} 条 · 页面路径/块/指纹 ${pageTouched} 条（其中块升级 ${blockTouched} 条）` +
      ` · 块副本复制 ${blockCopied} 个 · 地址冲突 ${collisions.length} 条`
  )
  if (collisions.length) {
    console.warn('以下页面地址存在冲突（已跳过，请人工确认哪一页保留该地址）：')
    for (const item of collisions) console.warn(`  - ${item}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
