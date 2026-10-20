/**
 * 建站描述导入器（09 §12.2）
 *
 * 为什么需要它：一个真实站点包含「站点档案 + 目录树 + 24 个页面 + 每页若干块 + 导航」，
 * 全部靠后台点选录入是几十次重复操作且容易漏字段。导入器把建站描述（JSON）一次性灌入，
 * 既便于复核（描述文件可评审、可重放），也便于下次批量改版。
 *
 * 幂等：按「站点 slug / 目录 slug / 页面 slug」定位，重复执行只更新不重复创建。
 * 路径物化：目录与页面写完后统一调用 `recomputePaths`，保证 Page.path 与实际 URL 一致。
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { ContentEditorService } from '../content/editor.service'
import { PUBLIC_BLOCK_SITE_ID, sortPublicFirst } from '../blocks/blocks.service'
import { copyTemplatesToSite } from '../blocks/block-copy'
import { NavigationService } from '../navigation/navigation.service'
import { PublishService } from '../publish/publish.service'
import { toJsonInput } from '../../common/utils/json'
import { isValidPathSegment, resolvePagePath } from '../../common/utils/site-path'
import { computePageContentHash, normalizeBlockInstances } from '../../common/utils/content-hash'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import type { BootstrapSiteDto } from './dto'

/** 站点表中 Json 列（导入时同样需要转换） */
const PROFILE_JSON_FIELDS = [
  'abbrName',
  'practiceScopes',
  'openingHours',
  'sameAs',
  'themeTokens',
  'robotsMeta',
  'robotsPolicy',
  'themeConfig'
] as const

/** 统计结果 */
export interface BootstrapResult {
  siteId: string
  slug: string
  channels: { created: number; updated: number }
  pages: { created: number; updated: number }
  navigations: number
  publishTaskId: string | null
}

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger('Bootstrap')

  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ContentEditorService,
    private readonly navigations: NavigationService,
    private readonly publish: PublishService
  ) {}

  /** 导入建站描述 */
  async run(user: AuthUser, dto: BootstrapSiteDto): Promise<BootstrapResult> {
    if (!isValidPathSegment(dto.slug)) {
      throw new BadRequestException(`站点标识非法：${dto.slug}（应为小写字母开头的字母/数字/连字符）`)
    }

    // ---------- 1) 站点档案 ----------

    const profile = (dto.profile || {}) as Record<string, unknown>
    const siteData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(profile)) {
      if (value === undefined) continue
      siteData[key] = PROFILE_JSON_FIELDS.includes(key as (typeof PROFILE_JSON_FIELDS)[number])
        ? toJsonInput(value)
        : value
    }
    siteData.name = dto.name
    if (dto.domain) siteData.domain = dto.domain

    let site = await this.prisma.site.findUnique({ where: { slug: dto.slug } })
    if (site) {
      assertSiteAccess(user, site.id)
      await this.prisma.site.update({ where: { id: site.id }, data: siteData as never })
    } else {
      if (!dto.domain) throw new BadRequestException('新建站点必须提供 domain')
      site = await this.prisma.site.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          domain: dto.domain,
          companyName: (profile.companyName as string) || dto.name,
          ...siteData
        } as never
      })
    }

    const siteId = site.id
    this.logger.log(`建站导入：${dto.slug}（siteId=${siteId}）`)

    // ---------- 2) 目录树（两遍：先建节点，再连父子） ----------

    const channels = dto.channels ?? []
    let channelCreated = 0
    let channelUpdated = 0

    for (const [index, item] of channels.entries()) {
      if (!isValidPathSegment(item.slug)) {
        throw new BadRequestException(`目录标识非法：${item.slug}`)
      }
      const existing = await this.prisma.channel.findFirst({ where: { siteId, slug: item.slug } })
      if (existing) {
        await this.prisma.channel.update({
          where: { id: existing.id },
          data: { name: item.name, sort: item.sort ?? index }
        })
        channelUpdated += 1
      } else {
        await this.prisma.channel.create({
          data: { siteId, name: item.name, slug: item.slug, sort: item.sort ?? index }
        })
        channelCreated += 1
      }
    }

    // 父级引用在全部节点存在后才能解析（描述里父目录可能排在子目录后面）
    for (const item of channels) {
      if (!item.parentSlug) continue
      const child = await this.prisma.channel.findFirst({ where: { siteId, slug: item.slug } })
      const parent = await this.prisma.channel.findFirst({ where: { siteId, slug: item.parentSlug } })
      if (!child || !parent) throw new BadRequestException(`目录父子关系无效：${item.parentSlug} → ${item.slug}`)
      if (child.parentId !== parent.id) {
        await this.prisma.channel.update({ where: { id: child.id }, data: { parentId: parent.id } })
      }
    }

    /** 目录路径物化（页面路径由目录路径派生，必须先算） */
    await this.editor.recomputePaths(siteId)

    // ---------- 3) 页面与块数据 ----------

    const pages = dto.pages ?? []
    let pageCreated = 0
    let pageUpdated = 0

    /**
     * 导入描述里用到的块：先复制成本站自有块（公共块只作模板，09 §4.5）。
     * 复制必须在算内容指纹之前——指纹取的是**本站副本**的 codeHash。
     */
    const usedBlockKeys = pages.flatMap((page) => (page.blocks ?? []).map((block) => String(block.key ?? '')))
    if (usedBlockKeys.length) await copyTemplatesToSite(this.prisma, siteId, usedBlockKeys)

    /** 块代码指纹表：页面内容指纹依赖块代码版本，块改了页面就应重新发布 */
    const codeHashMap = new Map<string, string>()
    const blockDefs = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId }] },
      select: { key: true, codeHash: true, siteId: true }
    })
    for (const def of blockDefs.sort(sortPublicFirst)) codeHashMap.set(def.key, def.codeHash)

    const channelList = await this.prisma.channel.findMany({ where: { siteId } })
    const channelBySlug = new Map(channelList.map((item) => [item.slug, item]))

    for (const [index, item] of pages.entries()) {
      if (!isValidPathSegment(item.slug)) {
        throw new BadRequestException(`页面标识非法：${item.slug}`)
      }
      const channel = channelBySlug.get(item.channelSlug)
      if (!channel) throw new BadRequestException(`页面 ${item.slug} 的目录不存在：${item.channelSlug}`)

      /** 块实例：补全 id / enabled，保证与渲染引擎契约一致；
       *  section（页面节奏提示，ADR-036）原样透传，缺省 undefined 走块默认清单 */
      const blocks = normalizeBlockInstances(
        (item.blocks ?? []).map((block) => ({
          id: (block.id as string) || `b_${randomBytes(4).toString('hex')}`,
          key: String(block.key ?? ''),
          enabled: block.enabled !== false,
          data: (block.data as Record<string, unknown>) ?? {},
          section: typeof block.section === 'string' ? block.section : undefined
        }))
      )
      const missing = blocks.filter((block) => !codeHashMap.has(block.key))
      if (missing.length) {
        throw new BadRequestException(
          `页面 ${item.slug} 引用了不存在的块：${missing.map((block) => block.key).join(', ')}（请先导入块定义）`
        )
      }

      const path = resolvePagePath(channel.path ?? `/${channel.slug}`, item.slug)
      /**
       * 定位键必须是「目录 + slug」而不是「站点 + slug」：
       * 目录落地页的 slug 恒为 `index`（唯一约束是 [siteId, channelId, slug]），
       * 按站点 + slug 查会把十几个落地页全部命中同一个页面、互相覆盖。
       */
      const existing = await this.prisma.page.findFirst({
        where: { siteId, channelId: channel.id, slug: item.slug }
      })

      const payload: Record<string, unknown> = {
        title: item.title,
        channelId: channel.id,
        templateId: item.templateId || 'default',
        kind: item.kind || 'static',
        summary: item.summary ?? null,
        seoTitle: item.seoTitle ?? null,
        seoDescription: item.seoDescription ?? null,
        seoKeywords: item.seoKeywords ?? null,
        authorName: item.authorName ?? null,
        blocks: toJsonInput(blocks),
        editorial: item.editorial ? toJsonInput(item.editorial) : undefined,
        sort: item.sort ?? index,
        /** 导入即发布：导入描述是可复核的终态内容，不必再走一遍人工发布 */
        status: 'published',
        publishedAt: new Date(),
        contentHash: computePageContentHash(
          {
            title: item.title,
            slug: item.slug,
            path,
            kind: item.kind || 'static',
            summary: item.summary ?? null,
            seoTitle: item.seoTitle ?? null,
            seoDescription: item.seoDescription ?? null,
            blocks
          },
          (blockKey) => codeHashMap.get(blockKey) ?? ''
        )
      }

      if (existing) {
        await this.prisma.page.update({ where: { id: existing.id }, data: payload as never })
        pageUpdated += 1
      } else {
        await this.prisma.page.create({
          data: { siteId, slug: item.slug, path, ...payload } as never
        })
        pageCreated += 1
      }
    }

    /** 页面路径最终物化（新建页面可能改变了同名 slug 的归属） */
    await this.editor.recomputePaths(siteId)

    // ---------- 4) 导航（pageSlug → pageId） ----------

    const navigationInputs = dto.navigations ?? []
    const pageList = await this.prisma.page.findMany({
      where: { siteId },
      select: { id: true, slug: true, path: true, channelId: true }
    })
    /** Page 与 Channel 未建 Prisma 关系（仅以 channelId 关联），复合键需手工拼 */
    const channelSlugById = new Map(
      (await this.prisma.channel.findMany({ where: { siteId }, select: { id: true, slug: true } })).map((item) => [
        item.id,
        item.slug
      ])
    )
    /** 路径索引：目录落地页的 slug 固定为 index，跨目录会重名，因此按路径定位才唯一 */
    const pageByPath = new Map(pageList.map((item) => [item.path, item]))
    /** 「目录/页面」复合键索引：给导入描述用的可读写法，如 doctors/index */
    const pageByComposite = new Map(
      pageList.map((item) => [`${channelSlugById.get(item.channelId) ?? ''}/${item.slug}`, item])
    )
    /** 裸 slug 索引：仅当全站唯一时才可用（如 home） */
    const slugCount = new Map<string, number>()
    for (const item of pageList) slugCount.set(item.slug, (slugCount.get(item.slug) ?? 0) + 1)

    for (const nav of navigationInputs) {
      const items = nav.items.map((item) => {
        const ref = (item.pageSlug || '').trim()
        let page = null
        if (ref) {
          if (ref.startsWith('/')) page = pageByPath.get(ref) ?? null
          else if (ref.includes('/')) page = pageByComposite.get(ref) ?? null
          else if (slugCount.get(ref) === 1) {
            page = pageList.find((item2) => item2.slug === ref) ?? null
          }
          if (!page) {
            throw new BadRequestException(`导航「${nav.key}」的项「${item.label}」指向的页面无法定位：${ref}`)
          }
        }
        return {
          label: item.label,
          pageId: page?.id ?? null,
          href: item.href ?? null
        }
      })
      await this.navigations.save(user, nav.key, { siteId, items })
    }

    // ---------- 5) 可选：立即构建 ----------

    let publishTaskId: string | null = null
    if (dto.publish) {
      const routes = await this.prisma.page.findMany({
        where: { siteId, status: 'published' },
        select: { id: true }
      })
      /** 系统入口：允许排队——导入流程不该被上一次未结束的构建挡下（06 §1.1） */
      const task = await this.publish.enqueue(
        user,
        siteId,
        'site',
        { pageIds: routes.map((item) => item.id) },
        { allowQueueWhenBusy: true }
      )
      publishTaskId = task.id
    }

    return {
      siteId,
      slug: dto.slug,
      channels: { created: channelCreated, updated: channelUpdated },
      pages: { created: pageCreated, updated: pageUpdated },
      navigations: navigationInputs.length,
      publishTaskId
    }
  }
}
