/**
 * 新闻/问答派生块同步服务（news-faq 模块的核心）
 *
 * 新闻与问答的管理源是 NewsArticle / FaqItem 独立数据表；Page 是发布产物：
 * kind=detail 的详情页（/news/*、/faq/q*）加上承载派生数据的列表页（/news、/faq）。
 * 详情页增删改后，受影响页面的块数组在这里整体重算并按 Prisma 事务写回：
 *
 *   1) /news 列表页：post-list.items = 全部新闻详情按发布日期倒序（不含分类字段）；
 *      hero-dark.chips 置空（新闻去分类）；存在独立 pager 块实例则移除（分页由 post-list 客户端承担）
 *   2) /faq 列表页：hero-dark 的 eyebrow/chips、anchor-bar、hot-faq 按全量问答重算；
 *      每个分类一组 section-head + faq-index；固定文案块（热门问答/全部问答标题、notice、telbar）不动
 *   3) 问答详情页：受影响分类下所有详情页的 related-faq.items = 同分类其它问答前 8 条
 *
 * 详情数据装载（loadNewsDetails / loadFaqDetails）直接读管理表——表是唯一事实来源，
 * 页面块只是把表内容物化成发布产物。
 *
 * 同步只重算派生块；块实例 id 按「同 key 顺序复用旧 id」分配，结构不变时内容指纹保持稳定。
 */
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import {
  FAQ_DETAIL_RELATED_HEAD,
  HERO_ACTIONS,
  HERO_NOTE,
  NOTICE_COMPLIANCE,
  NOTICE_FAQ_CALIBER,
  TELBAR_FAQ,
  TELBAR_NEWS
} from './news-faq.constants'

/** 相关问答（related-faq）最多条数 */
export const RELATED_FAQ_MAX = 8
/** 热门问答（hot-faq）条数 */
export const HOT_FAQ_MAX = 6
/** 列表答案摘要截断长度 */
export const EXCERPT_MAX = 80
/** hero-dark lead 截断长度 */
export const LEAD_MAX = 120

/** 问答分类分组头 section-head 的 desc 特征（如「医院推荐 · 共 24 条」「共 24 条」） */
const CATEGORY_HEAD_PATTERN = /(?:·\s*)?共 \d+ 条$/

/** 同步后的块实例写入形态 */
export interface BlockInstanceInput {
  id: string
  key: string
  enabled: boolean
  data: Record<string, unknown>
  /** 页面节奏提示（ADR-036），原样保留，缺省由渲染器按块 key 取默认值 */
  section?: string
}

/** 新闻详情投影（从 NewsArticle 表映射；id 为表主键） */
export interface NewsDetail {
  id: string
  /** 发布产物页面 ID（页面缺失时为 null） */
  pageId: string | null
  path: string
  title: string
  summary: string
  publishDate: string
}

/** 问答详情投影（从 FaqItem 表映射；id 为表主键，seq 为 slug qNNN 的全局序号） */
export interface FaqDetail {
  id: string
  /** 发布产物页面 ID（页面缺失时为 null） */
  pageId: string | null
  path: string
  seq: number
  question: string
  category: string
  paragraphs: string[]
}

/** 文本截断：超长部分以「…」结尾（与既有页面块数据口径一致） */
export function truncate(text: string, max: number): string {
  const value = text ?? ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** 序号补零：faq-index / related-faq 的 idx 为两位（100 及以上自然进位为三位） */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 问答路径序号补零：/faq/q001 为三位 */
export function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

/** 纯文本按换行拆段落（去空行、去首尾空白） */
export function splitParagraphs(content: string): string[] {
  return String(content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** 从问答路径（/faq/q012）或 slug（q012）取全局序号（不匹配返回 0） */
export function parseFaqSeq(path: string | null | undefined): number {
  const match = /(?:^|\/faq\/)q(\d+)$/.exec(String(path ?? ''))
  return match ? Number(match[1]) : 0
}

/** 生成新的块实例 id（前缀为 key 去连字符截 8 位，4 位数字后缀，页内唯一） */
function generateInstanceId(key: string, used: Set<string>): string {
  const prefix = key.replace(/-/g, '').slice(0, 8)
  let id = ''
  do {
    id = `${prefix}_${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
  } while (used.has(id))
  used.add(id)
  return id
}

/**
 * 给重建后的块实例分配 id：同 key 按出现顺序复用旧实例的 id，
 * 旧实例不够用时生成新 id——常规编辑（只改数据不改结构）下内容指纹保持稳定
 */
function withStableIds(
  next: { key: string; enabled?: boolean; data: Record<string, unknown> }[],
  oldBlocks?: unknown
): BlockInstanceInput[] {
  const used = new Set<string>()
  const reusable = new Map<string, { id: string; section?: string }[]>()
  for (const inst of normalizeBlockInstances(oldBlocks)) {
    if (inst.id && !used.has(inst.id)) {
      used.add(inst.id)
      const list = reusable.get(inst.key) ?? []
      list.push({ id: inst.id, section: inst.section })
      reusable.set(inst.key, list)
    }
  }

  const cursor = new Map<string, number>()
  return next.map((item) => {
    const list = reusable.get(item.key) ?? []
    const index = cursor.get(item.key) ?? 0
    cursor.set(item.key, index + 1)
    const reuse = list[index]
    const id = reuse?.id ?? generateInstanceId(item.key, used)
    return reuse?.section
      ? { id, key: item.key, enabled: item.enabled ?? true, data: item.data, section: reuse.section }
      : { id, key: item.key, enabled: item.enabled ?? true, data: item.data }
  })
}

/** 分类汇总（首次出现顺序 = 既有页面的展示顺序），供 anchor-bar / faq-index 分组使用 */
export function summarizeCategories(details: FaqDetail[]): { name: string; count: number }[] {
  const ordered: { name: string; count: number }[] = []
  const index = new Map<string, number>()
  for (const detail of details) {
    const found = index.get(detail.category)
    if (found === undefined) {
      index.set(detail.category, ordered.length)
      ordered.push({ name: detail.category, count: 1 })
    } else {
      ordered[found].count += 1
    }
  }
  return ordered
}

@Injectable()
export class NewsFaqSyncService {
  private readonly logger = new Logger('NewsFaqSync')

  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService
  ) {}

  // ---------------- 详情页标准块组合 ----------------

  /**
   * 新闻详情页标准块组合：
   * hero-dark(停用) + article-meta(仅日期，新闻去分类) + article-body + telbar
   * 合规声明由 article-body 自带 disclaimer 承担（发布前置必填），
   * 不再另设独立 notice 块——重复声明会输出两条相同文案（2026-10-15 去重）。
   */
  buildArticleDetailBlocks(
    input: { title: string; summary: string; publishDate: string; paragraphs: string[] },
    oldBlocks?: unknown
  ): BlockInstanceInput[] {
    const next = [
      {
        key: 'hero-dark',
        enabled: false,
        data: {
          h1: input.title,
          lead: truncate(input.summary, LEAD_MAX),
          note: HERO_NOTE,
          chips: [],
          actions: HERO_ACTIONS,
          eyebrow: input.publishDate
        }
      },
      { key: 'article-meta', enabled: true, data: { date: input.publishDate } },
      {
        key: 'article-body',
        enabled: true,
        data: {
          disclaimer: NOTICE_COMPLIANCE.text,
          blocks: input.paragraphs.map((text) => ({ kind: 'paragraph', text }))
        }
      },
      { key: 'telbar', enabled: true, data: { ...TELBAR_NEWS } }
    ]
    return withStableIds(next, oldBlocks)
  }

  /**
   * 问答详情页标准块组合：
   * hero-dark(停用) + faq-detail + section-head(相关内容) + related-faq + notice×2 + telbar
   */
  buildFaqDetailBlocks(
    input: { question: string; category: string; paragraphs: string[]; related: FaqDetail[] },
    oldBlocks?: unknown
  ): BlockInstanceInput[] {
    const next = [
      {
        key: 'hero-dark',
        enabled: false,
        data: {
          h1: input.question,
          lead: truncate(input.paragraphs.join(''), LEAD_MAX),
          note: HERO_NOTE,
          chips: [input.category],
          actions: HERO_ACTIONS,
          eyebrow: `高频问答 · ${input.category}`
        }
      },
      {
        key: 'faq-detail',
        enabled: true,
        data: { cat: input.category, question: input.question, paragraphs: input.paragraphs }
      },
      { key: 'section-head', enabled: true, data: { ...FAQ_DETAIL_RELATED_HEAD } },
      {
        key: 'related-faq',
        enabled: true,
        data: {
          items: input.related.slice(0, RELATED_FAQ_MAX).map((item) => ({
            idx: pad2(item.seq),
            href: item.path,
            text: item.question
          }))
        }
      },
      { key: 'notice', enabled: true, data: { ...NOTICE_FAQ_CALIBER } },
      { key: 'notice', enabled: true, data: { ...NOTICE_COMPLIANCE } },
      { key: 'telbar', enabled: true, data: { ...TELBAR_FAQ } }
    ]
    return withStableIds(next, oldBlocks)
  }

  // ---------------- 详情数据装载（表驱动：管理表是唯一事实来源） ----------------

  /** 全部已发布新闻详情（从 NewsArticle 表映射），按发布日期倒序、同日按 id 倒序 */
  async loadNewsDetails(siteId: string): Promise<NewsDetail[]> {
    const rows = await this.prisma.newsArticle.findMany({
      where: { siteId, status: 'published' },
      select: { id: true, pageId: true, slug: true, title: true, summary: true, publishDate: true }
    })
    return rows
      .map((row) => ({
        id: row.id,
        pageId: row.pageId,
        path: joinPath('/news', row.slug),
        title: row.title,
        summary: row.summary,
        publishDate: row.publishDate
      }))
      .sort((a, b) => {
        if (a.publishDate !== b.publishDate) return a.publishDate < b.publishDate ? 1 : -1
        return b.id > a.id ? 1 : b.id < a.id ? -1 : 0
      })
  }

  /** 全部已发布问答详情（从 FaqItem 表映射），按 slug q 序号升序 */
  async loadFaqDetails(siteId: string): Promise<FaqDetail[]> {
    const rows = await this.prisma.faqItem.findMany({
      where: { siteId, status: 'published' },
      select: { id: true, pageId: true, slug: true, question: true, category: true, answer: true }
    })
    return rows
      .map((row) => ({
        id: row.id,
        pageId: row.pageId,
        path: joinPath('/faq', row.slug),
        seq: parseFaqSeq(row.slug),
        question: row.question,
        category: row.category,
        paragraphs: splitParagraphs(row.answer)
      }))
      .filter((item) => item.seq > 0)
      .sort((a, b) => a.seq - b.seq)
  }

  // ---------------- 同步入口 ----------------

  /**
   * 文章增删改后的同步：整体重算 /news 列表页派生块
   * @param ownPageIds 参与本次变更的文章详情页 id（新建/编辑；删除时为空）
   * @returns 受影响页面 id 集合（含自身页面与被重算的列表页）
   */
  async syncAfterArticleChange(siteId: string, ownPageIds: string[]): Promise<string[]> {
    const affected = new Set(ownPageIds)
    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: '/news' },
      select: { id: true, blocks: true }
    })
    if (listPage) {
      const details = await this.loadNewsDetails(siteId)
      const items = details.map((detail) => ({
        href: detail.path,
        title: detail.title,
        summary: detail.summary,
        publishDate: detail.publishDate
      }))
      /** 原位更新派生块（id 不变），移除独立 pager 块实例，其余块（section-head/notice/telbar）不动 */
      const next = normalizeBlockInstances(listPage.blocks)
        .map((inst) => {
          if (inst.key === 'hero-dark') return { ...inst, data: { ...inst.data, chips: [] } }
          if (inst.key === 'post-list') return { ...inst, data: { ...inst.data, items } }
          return inst
        })
        .filter((inst) => inst.key !== 'pager')
      await this.writeBlocks([{ id: listPage.id, blocks: next }])
      affected.add(listPage.id)
    }
    await this.refreshHashes([...affected])
    return [...affected]
  }

  /**
   * 问答增删改后的同步：整体重算 /faq 列表页 + 受影响分类全部详情页的 related-faq
   * @param ownPageIds 参与本次变更的问答详情页 id（删除时为空）
   * @param categories 受影响分类（编辑换分类时传旧 + 新两个）
   */
  async syncAfterFaqChange(siteId: string, ownPageIds: string[], categories: string[]): Promise<string[]> {
    const affected = new Set(ownPageIds)
    const all = await this.loadFaqDetails(siteId)
    const cats = summarizeCategories(all)
    const writes: { id: string; blocks: ReturnType<typeof normalizeBlockInstances> }[] = []

    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: '/faq' },
      select: { id: true, blocks: true }
    })
    if (listPage) {
      writes.push({ id: listPage.id, blocks: this.rebuildFaqListBlocks(listPage.blocks, all, cats) })
      affected.add(listPage.id)
    }

    /** 受影响分类的所有详情页重算 related-faq（同分类其它问答前 8 条；页面缺失的行跳过） */
    const changed = new Set(categories.filter(Boolean))
    for (const detail of all) {
      if (!changed.has(detail.category)) continue
      if (detail.pageId == null) continue
      const page = await this.prisma.page.findUnique({
        where: { id: detail.pageId },
        select: { id: true, blocks: true }
      })
      if (!page) continue
      const next = normalizeBlockInstances(page.blocks).map((inst) => {
        if (inst.key !== 'related-faq') return inst
        const items = all
          .filter((item) => item.category === detail.category && item.id !== detail.id)
          .slice(0, RELATED_FAQ_MAX)
          .map((item) => ({ idx: pad2(item.seq), href: item.path, text: item.question }))
        return { ...inst, data: { ...inst.data, items } }
      })
      writes.push({ id: page.id, blocks: next })
      affected.add(page.id)
    }

    await this.writeBlocks(writes)
    await this.refreshHashes([...affected])
    return [...affected]
  }

  /**
   * 重建 /faq 列表页块数组：
   * 头部（hero-dark / anchor-bar / 热门问答标题 / hot-faq / 全部问答标题）原位更新数据；
   * 分类分组（section-head + faq-index）整体重算；尾部 notice / telbar 原样保留。
   * 分类分组头 section-head 的 desc 沿用既有页面口径「分类名 · 共 N 条」。
   */
  private rebuildFaqListBlocks(oldBlocks: unknown, details: FaqDetail[], cats: { name: string; count: number }[]) {
    const instances = normalizeBlockInstances(oldBlocks)

    /** 尾部固定块：从末尾向前收集 notice / telbar */
    let tailStart = instances.length
    while (tailStart > 0 && ['notice', 'telbar'].includes(instances[tailStart - 1].key)) tailStart -= 1
    const head = instances.slice(0, tailStart)
    const tail = instances.slice(tailStart)

    /** 头部里被移除的分类分组实例，其 id 按序复用给重建后的分组（结构不变时指纹稳定） */
    const removedHeads = head.filter(
      (inst) => inst.key === 'section-head' && CATEGORY_HEAD_PATTERN.test(String(inst.data?.desc ?? ''))
    )
    const removedIndexes = head.filter((inst) => inst.key === 'faq-index')

    const keptHead = head
      .filter((inst) => inst.key !== 'faq-index')
      .filter((inst) => !(inst.key === 'section-head' && CATEGORY_HEAD_PATTERN.test(String(inst.data?.desc ?? ''))))
      .map((inst) => {
        if (inst.key === 'hero-dark') {
          return {
            ...inst,
            data: {
              ...inst.data,
              eyebrow: `${details.length} 条问答 · ${cats.length} 分类`,
              chips: cats.map((cat) => cat.name)
            }
          }
        }
        if (inst.key === 'anchor-bar') {
          return {
            ...inst,
            data: { ...inst.data, items: cats.map((cat) => ({ label: cat.name, count: cat.count, href: '#' })) }
          }
        }
        if (inst.key === 'hot-faq') {
          return {
            ...inst,
            data: {
              ...inst.data,
              items: details.slice(0, HOT_FAQ_MAX).map((item) => ({
                q: item.question,
                a: truncate(item.paragraphs.join(''), EXCERPT_MAX),
                href: item.path
              }))
            }
          }
        }
        return inst
      })

    const pairBlocks = cats.flatMap((cat) => {
      const items = details
        .filter((item) => item.category === cat.name)
        .map((item) => ({
          q: item.question,
          a: truncate(item.paragraphs.join(''), EXCERPT_MAX),
          idx: pad2(item.seq),
          href: item.path
        }))
      return withStableIds(
        [
          { key: 'section-head', data: { title: cat.name, desc: `${cat.name} · 共 ${cat.count} 条` } },
          { key: 'faq-index', data: { items } }
        ],
        [removedHeads.shift(), removedIndexes.shift()].filter(Boolean)
      )
    })

    return [...keptHead, ...pairBlocks, ...tail]
  }

  // ---------------- 内部 ----------------

  /** 事务写回页面块数组 */
  private async writeBlocks(writes: { id: string; blocks: unknown }[]) {
    if (!writes.length) return
    await this.prisma.$transaction(async (tx) => {
      for (const write of writes) {
        await tx.page.update({ where: { id: write.id }, data: { blocks: toJsonInput(write.blocks) } })
      }
    })
  }

  /** 内容指纹重算（块代码指纹口径与编辑器一致，统一走 ContentEditorService） */
  private async refreshHashes(pageIds: string[]) {
    for (const id of pageIds) {
      try {
        await this.editor.refreshContentHash(id)
      } catch (error) {
        this.logger.warn(`内容指纹重算失败 pageId=${id}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
