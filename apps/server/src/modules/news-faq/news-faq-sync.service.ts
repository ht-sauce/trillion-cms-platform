/**
 * 新闻/问答派生块同步服务（news-faq 模块的核心）
 *
 * 新闻与问答的管理源是 NewsArticle / FaqItem 独立数据表；Page 是发布产物：
 * kind=detail 的详情页（/news/*、/faq/*）加上承载派生数据的列表页（/news、/faq）。
 *
 * **详情页结构模板取自站点既有详情页**（该栏目下最早创建的 detail 页面）：
 * 块 key 序列、section-head 文案、telbar、notice、article-body.disclaimer 等站点级口径
 * 一律沿用模板；本服务只替换「跟内容走」的字段（标题/导语/日期/正文/分类/相关问答）。
 * 因此同一套代码对任何站点成立，代码里不含任何站点文案（原医院站硬编码已移除）。
 *
 *   1) /news 列表页：post-list.items = 全部新闻按发布日期倒序；其余块（hero/chips/telbar）不动
 *   2) /faq 列表页：每个 faq-list 块按自身 category 重填 items（保留标题与列数，只填上架问答）；
 *      hero-dark.chips 与上架出现的分类对齐；faq-board（分类页签 + 搜索 + 分页）填全量问答
 *   3) 问答详情页：受影响分类下所有详情页的 faq-list（相关问答）= 同分类其它问答
 *
 * 块实例 id 按「同 key 顺序复用旧 id」分配（withStableIds），结构不变时内容指纹保持稳定。
 */
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { normalizeBlockInstances } from '../../common/utils/content-hash'
import {
  assembleFromTemplate,
  blockData,
  withStableIds,
  type BlockInstanceInput
} from '../../common/utils/block-instances'
import { joinPath } from '../../common/utils/site-path'
import { toJsonInput } from '../../common/utils/json'
import { resolveArticleBlocks, type ArticleBlock } from '../../common/utils/article-body'

/** 相关问答最多条数 */
export const RELATED_FAQ_MAX = 8
/** hero-dark lead 截断长度 */
export const LEAD_MAX = 120

/**
 * 卡片答案文本：**不截断**（ADR-057 配套改动）。
 * 段落之间保留换行，块侧用 `white-space: pre-line` 还原分段——
 * 长答案（施工流程这类分点回答）如果压成一段或截到 80 字，运营会以为「数据没抓全」。
 */
export function faqAnswerText(paragraphs: string[]): string {
  return paragraphs.filter(Boolean).join('\n')
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
  /** 封面图（素材库 publicUrl；列表卡片缩略图） */
  cover: string | null
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
  /** 答案受限富文本（段落 / 列表；卡片与详情页按它渲染结构，为空则回落 paragraphs） */
  answerHtml: string
  /** 是否在列表页上架展示（false = 只保留详情页，不进分类区块与全部问题列表） */
  featured: boolean
  /** 手工指定的关联问题 id（空 = 走「同分类其它问答」自动口径） */
  relatedIds: string[]
  /** 更新时间（YYYY-MM-DD，列表页 post-list 的展示日期） */
  updatedDate: string
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

/** 日期格式化（YYYY-MM-DD，中国时区口径） */
function toDateString(value: Date): string {
  return new Date(value.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

@Injectable()
export class NewsFaqSyncService {
  private readonly logger = new Logger('NewsFaqSync')

  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService
  ) {}

  // ---------------- 详情页模板与块组合 ----------------

  /**
   * 栏目兜底骨架（栏目无任何 detail 页时的降级模板，ADR-052 第 5 条）：
   * 只含块 key 与空数据——站点文案为零，内容全部由 build*Blocks 的字段覆盖填充。
   * 没有它，栏目第一个详情页会以「空模板」派生出空块组合，且后续页面克隆这个空页，整栏目全空。
   */
  private static readonly FALLBACK_TEMPLATES: Record<string, BlockInstanceInput[]> = {
    '/news': [
      { id: 'fallback-hero', key: 'hero-dark', data: {}, enabled: true },
      { id: 'fallback-meta', key: 'article-meta', data: {}, enabled: true },
      { id: 'fallback-body', key: 'article-body', data: {}, enabled: true }
    ],
    '/faq': [
      { id: 'fallback-head', key: 'section-head', data: {}, enabled: true },
      { id: 'fallback-body', key: 'article-body', data: {}, enabled: true },
      { id: 'fallback-related', key: 'faq-list', data: {}, enabled: true }
    ]
  }

  /** 站点内某栏目的详情页结构模板：取最早创建的 detail 页面（块骨架 + 固定文案的唯一来源） */
  async loadDetailTemplate(siteId: string, section: string): Promise<BlockInstanceInput[]> {
    const page = await this.prisma.page.findFirst({
      where: { siteId, kind: 'detail', path: { startsWith: `${section}/` } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { blocks: true }
    })
    const template = normalizeBlockInstances(page?.blocks)
    /** 模板缺失或为空（如栏目第一个详情页正在创建）时退回程序化骨架 */
    return template.length ? template : NewsFaqSyncService.FALLBACK_TEMPLATES[section] || []
  }

  /**
   * 新闻详情页标准块组合（模板骨架 + 表数据）：
   * hero-dark + article-meta + article-body + telbar
   * 标题/导语/日期/正文来自表；hero 的 eyebrow/orgline/actions/bgImage 等站点级字段
   * 沿用旧页面（编辑既有页）或模板（新建页），不在此处硬编码。
   */
  buildArticleDetailBlocks(
    input: {
      title: string
      summary: string
      publishDate: string
      paragraphs: string[]
      cover?: string | null
      /** 正文整篇 HTML（ADR-060 主数据）；有值则优先，渲染原样输出 */
      bodyHtml?: string | null
      /** 结构化正文块（历史兼容）；bodyHtml 为空时回落 paragraphs 纯文本 */
      body?: ArticleBlock[] | null
    },
    template: BlockInstanceInput[],
    oldBlocks?: unknown
  ): BlockInstanceInput[] {
    const current = normalizeBlockInstances(oldBlocks)
    const base = Object.keys(blockData(current, 'hero-dark')).length
      ? blockData(current, 'hero-dark')
      : blockData(template, 'hero-dark')
    const hero: Record<string, unknown> = {
      ...base,
      h1: input.title,
      lead: truncate(input.summary, LEAD_MAX)
    }
    /** 封面图：表字段优先；空则保留模板/旧页背景（编辑清空 = 回落） */
    if (input.cover) hero.bgImage = input.cover
    else if (input.cover === null) delete hero.bgImage
    /** 新建页没有可继承的 eyebrow/orgline，用日期兜底（均为可选字段，空则不渲染） */
    if (!base.eyebrow) hero.eyebrow = input.publishDate
    if (hero.h1Grad && !input.title.includes(String(hero.h1Grad))) delete hero.h1Grad

    const overrides: Record<string, Record<string, unknown> | null> = {
      'hero-dark': hero,
      'article-meta': { date: input.publishDate },
      /** 正文整篇 HTML 优先（ADR-060）；无 HTML 时回落历史块数组 / 纯文本分段 */
      'article-body': input.bodyHtml ? { html: input.bodyHtml, blocks: [] } : { blocks: resolveArticleBlocks(input.body ?? null, input.paragraphs) }
    }
    return withStableIds(assembleFromTemplate(template, overrides), oldBlocks)
  }

  /**
   * 问答详情页标准块组合（模板骨架 + 表数据）：
   * section-head（问题）+ article-body（答案）→ section-head + faq-list（同分类相关问答）+ telbar
   * 长文详解型（模板含 article-body）与短答型（模板含 faq-detail）均支持：
   * 模板没有的块不会被凭空创建，只按模板骨架替换内容。
   */
  buildFaqDetailBlocks(
    input: {
      question: string
      category: string
      paragraphs: string[]
      /** 答案富文本（有则作为单一 rich 块渲染，保住段落与列表结构） */
      answerHtml?: string
      related: FaqDetail[]
    },
    template: BlockInstanceInput[],
    oldBlocks?: unknown
  ): BlockInstanceInput[] {
    const current = normalizeBlockInstances(oldBlocks)
    const heroBase = Object.keys(blockData(current, 'hero-dark')).length
      ? blockData(current, 'hero-dark')
      : blockData(template, 'hero-dark')
    const hero: Record<string, unknown> = {
      ...heroBase,
      h1: input.question,
      lead: truncate(input.paragraphs.join(''), LEAD_MAX),
      chips: [input.category]
    }
    if (hero.h1Grad && !input.question.includes(String(hero.h1Grad))) delete hero.h1Grad

    const relatedItems = input.related.slice(0, RELATED_FAQ_MAX).map((item) => ({
      q: item.question,
      a: faqAnswerText(item.paragraphs)
    }))

    /** 详情页正文块：优先 article-body（长文），其次 faq-detail（短答） */
    const overrides: Record<string, Record<string, unknown> | null> = {
      'hero-dark': hero,
      'article-body': {
        blocks: input.answerHtml
          ? [{ kind: 'rich', html: input.answerHtml }]
          : input.paragraphs.map((text) => ({ kind: 'paragraph', text }))
      },
      'faq-detail': { cat: input.category, question: input.question, paragraphs: input.paragraphs },
      'faq-list': { items: relatedItems }
    }
    /** 首个 section-head 是页面主标题（问题），用问题替换模板里的示例标题 */
    const next = assembleFromTemplate(template, overrides)
    const firstHead = next.findIndex((block) => block.key === 'section-head')
    if (firstHead >= 0) {
      next[firstHead] = {
        ...next[firstHead],
        data: { ...next[firstHead].data, title: input.question, desc: `常见问题 · ${input.category}` }
      }
    }
    /** 关联问题区块补标题（模板里没写时才补，运营自定义过的不动） */
    for (const block of next) {
      if (block.key !== 'faq-list') continue
      if (String(block.data?.title ?? '').trim()) continue
      block.data = { ...block.data, title: '关联问题' }
      break
    }
    return withStableIds(next, oldBlocks)
  }

  /**
   * 详情页「关联问题」取数（ADR-057）：
   *   手工指定的 relatedIds 优先（按保存顺序，只取已发布、非自身、丢失的记录自动跳过）；
   *   没指定（或指定的全部失效）时回落到「同分类其它问答」——即改动前的自动口径。
   */
  resolveRelated(
    detail: { id: string; category: string; relatedIds: string[] },
    all: FaqDetail[]
  ): FaqDetail[] {
    const manual: FaqDetail[] = []
    for (const id of detail.relatedIds) {
      const hit = all.find((item) => item.id === id && item.id !== detail.id)
      if (hit && !manual.some((picked) => picked.id === hit.id)) manual.push(hit)
    }
    if (manual.length) return manual.slice(0, RELATED_FAQ_MAX)

    return all.filter((item) => item.category === detail.category && item.id !== detail.id)
  }

  // ---------------- 详情数据装载（表驱动：管理表是唯一事实来源） ----------------

  /** 全部已发布新闻详情（从 NewsArticle 表映射），按发布日期倒序、同日按 id 倒序 */
  async loadNewsDetails(siteId: string): Promise<NewsDetail[]> {
    const rows = await this.prisma.newsArticle.findMany({
      where: { siteId, status: 'published' },
      select: { id: true, pageId: true, slug: true, title: true, summary: true, publishDate: true, cover: true }
    })
    return rows
      .map((row) => ({
        id: row.id,
        pageId: row.pageId,
        path: joinPath('/news', row.slug),
        title: row.title,
        summary: row.summary,
        publishDate: row.publishDate,
        cover: row.cover
      }))
      .sort((a, b) => {
        if (a.publishDate !== b.publishDate) return a.publishDate < b.publishDate ? 1 : -1
        return b.id > a.id ? 1 : b.id < a.id ? -1 : 0
      })
  }

  /** 全部已发布问答详情（从 FaqItem 表映射），按 slug q 序号升序；非 qN 型 slug（如 thickness）排后 */
  async loadFaqDetails(siteId: string): Promise<FaqDetail[]> {
    const rows = await this.prisma.faqItem.findMany({
      where: { siteId, status: 'published' },
      select: {
        id: true,
        pageId: true,
        slug: true,
        question: true,
        category: true,
        answer: true,
        answerHtml: true,
        featured: true,
        relatedIds: true,
        updatedAt: true
      }
    })
    return rows
      .map((row) => ({
        id: row.id,
        pageId: row.pageId,
        path: joinPath('/faq', row.slug),
        seq: parseFaqSeq(row.slug),
        question: row.question,
        category: row.category,
        paragraphs: splitParagraphs(row.answer),
        answerHtml: row.answerHtml ?? '',
        featured: row.featured,
        /** relatedIds 为 JSON 列：只认字符串数组，脏数据按「未指定」处理 */
        relatedIds: Array.isArray(row.relatedIds)
          ? row.relatedIds.filter((id): id is string => typeof id === 'string')
          : [],
        updatedDate: toDateString(row.updatedAt)
      }))
      .sort((a, b) => a.seq - b.seq)
  }

  // ---------------- 同步入口 ----------------

  /**
   * 文章增删改后的同步：整体重算 /news 列表页的 post-list.items
   * @param ownPageIds 参与本次变更的文章详情页 id（删除时为空）
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
        publishDate: detail.publishDate,
        cover: detail.cover || ''
      }))
      const next = normalizeBlockInstances(listPage.blocks).map((inst) =>
        inst.key === 'post-list' ? { ...inst, data: { ...inst.data, items } } : inst
      )
      await this.writeBlocks([{ id: listPage.id, blocks: next }])
      affected.add(listPage.id)
    }
    await this.refreshHashes([...affected])
    return [...affected]
  }

  /**
   * 问答增删改后的同步：重算 /faq 列表页（分类区块 / hero 分类 / 分类页签）
   * 与受影响分类下所有详情页的关联问题（手工指定优先，见 resolveRelated）
   * @param ownPageIds 参与本次变更的问答详情页 id（删除时为空）
   * @param categories 受影响分类（编辑换分类时传旧 + 新两个）
   */
  async syncAfterFaqChange(siteId: string, ownPageIds: string[], categories: string[]): Promise<string[]> {
    const affected = new Set(ownPageIds)
    const all = await this.loadFaqDetails(siteId)
    const writes: { id: string; blocks: unknown }[] = []

    const listPage = await this.prisma.page.findFirst({
      where: { siteId, path: '/faq' },
      select: { id: true, blocks: true }
    })
    if (listPage) {
      writes.push({ id: listPage.id, blocks: this.rebuildFaqListBlocks(listPage.blocks, all) })
      affected.add(listPage.id)
    }

    /** 受影响分类的所有详情页重算关联问题（页面缺失的行跳过） */
    const changed = new Set(categories.filter(Boolean))
    for (const detail of all) {
      if (!changed.has(detail.category)) continue
      if (detail.pageId == null) continue
      const page = await this.prisma.page.findUnique({ where: { id: detail.pageId }, select: { id: true, blocks: true } })
      if (!page) continue
      const items = this.resolveRelated(detail, all)
        .slice(0, RELATED_FAQ_MAX)
        .map((item) => ({ q: item.question, a: faqAnswerText(item.paragraphs), h: item.answerHtml }))
      const next = normalizeBlockInstances(page.blocks).map((inst) =>
        inst.key === 'faq-list' ? { ...inst, data: { ...inst.data, items } } : inst
      )
      writes.push({ id: page.id, blocks: next })
      affected.add(page.id)
    }

    await this.writeBlocks(writes)
    await this.refreshHashes([...affected])
    return [...affected]
  }

  /**
   * 重建 /faq 列表页块数组（原位改数据，不增删块）：
   * - 每个 faq-list 块按自身 category（缺省取标题）重填 items，保留标题/列数；
   *   **只填 featured=true 的问答**（ADR-055：分类区块是「按需展示」的橱窗，
   *   条目过百后全铺开会把页面撑成流水账；未上架的问答仍保留详情页）
   * - hero-dark.chips 与上架出现的分类对齐
   * - faq-board（分类页签 + 搜索 + 分页）填**全量已发布问答**，每条带 cat 供前端分组
   * - post-list（旧版「核心问题详解」）兼容分支只填上架问答
   * 分类在页面上没有对应 faq-list 块时不新造分组（分组结构由站点编辑器维护）。
   */
  private rebuildFaqListBlocks(oldBlocks: unknown, details: FaqDetail[]) {
    const instances = normalizeBlockInstances(oldBlocks)
    const shown = details.filter((detail) => detail.featured)

    /** 页签顺序跟页面里分类区块的先后一致（块没写分类时退回标题），剩余分类按出现顺序补在末尾 */
    const categories: string[] = []
    for (const inst of instances) {
      if (inst.key !== 'faq-list') continue
      const key = String(inst.data?.category ?? '').trim() || String(inst.data?.title ?? '').trim()
      const matched = shown.find((detail) => detail.category === key || String(inst.data?.title ?? '') === detail.category)
      if (matched && !categories.includes(matched.category)) categories.push(matched.category)
    }
    for (const detail of shown) {
      if (detail.category && !categories.includes(detail.category)) categories.push(detail.category)
    }

    const withDetail = shown
      .filter((detail) => detail.pageId != null)
      .sort((a, b) => b.seq - a.seq)
      .map((detail) => ({
        href: detail.path,
        title: detail.question,
        summary: truncate(detail.paragraphs.join(''), LEAD_MAX),
        publishDate: detail.updatedDate
      }))

    /** 分类页签块的全量条目：按分类出现顺序聚合，分类内按序号倒序（新增恒排最前） */
    const boardItems: { cat: string; q: string; a: string; h: string; href: string }[] = []
    for (const category of categories) {
      for (const detail of details.filter((detail) => detail.category === category).sort((a, b) => b.seq - a.seq)) {
        boardItems.push({
          cat: category,
          q: detail.question,
          a: faqAnswerText(detail.paragraphs),
          h: detail.answerHtml,
          href: detail.path
        })
      }
    }

    return instances.map((inst) => {
      if (inst.key === 'hero-dark') {
        return { ...inst, data: { ...inst.data, chips: categories } }
      }
      if (inst.key === 'faq-list') {
        /** 分组归属：块上显式写的 category 优先，其次标题（既有页的标题常带「与材料」等修饰） */
        const key = String(inst.data?.category ?? '').trim() || String(inst.data?.title ?? '').trim()
        const items = shown
          .filter((detail) => detail.category === key || (inst.data?.title ?? '') === detail.category)
          .map((detail) => ({
            q: detail.question,
            a: faqAnswerText(detail.paragraphs),
            h: detail.answerHtml
          }))
        return { ...inst, data: { ...inst.data, items } }
      }
      if (inst.key === 'faq-board') {
        return { ...inst, data: { ...inst.data, items: boardItems } }
      }
      if (inst.key === 'post-list') {
        return { ...inst, data: { ...inst.data, items: withDetail } }
      }
      return inst
    })
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
