/**
 * 站点内容编辑器服务（09 §6）
 *
 * 负责：内容树、目录/页面的新建-重命名-上下移-删除、整页草稿三态、
 *      以及两条硬规则的落地：
 *        1) **URL 不可变**（ADR-025）：已发布页面的 slug / 所属目录锁定 → 400
 *        2) **路径物化**：Channel.path / Page.path 落库，作为「页面 ↔ 线上地址 ↔ 产物文件」的唯一锚点
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { computePageContentHash, normalizeBlockInstances } from '../../common/utils/content-hash'
import { isValidPathSegment, resolvePagePath } from '../../common/utils/site-path'
import { formatDateTime } from '../../common/utils/datetime'
import { toJsonInput } from '../../common/utils/json'
import { BlocksService } from '../blocks/blocks.service'
import { ArtifactsService } from '../publish/artifacts.service'
import type {
  CreateChannelDto,
  CreatePageDto,
  MoveDto,
  SaveDraftDto,
  UpdateChannelDto,
  UpdatePageMetaDto
} from './editor.dto'

/** 内容树中的块节点 */
interface BlockNode {
  id: string
  key: string
  name: string
  enabled: boolean
  missing: boolean
}

@Injectable()
export class ContentEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly artifacts: ArtifactsService
  ) {}

  // ---------------- 内容树 ----------------

  /** 一次返回目录 + 页面 + 块摘要 + 徽标（后台左树数据源） */
  async tree(user: AuthUser, siteId: string) {
    const id = siteId
    assertSiteAccess(user, id)

    const site = await this.prisma.site.findUnique({ where: { id }, select: { slug: true } })
    if (!site) throw new NotFoundException('站点不存在')

    const [channels, pages, blockList] = await Promise.all([
      this.prisma.channel.findMany({ where: { siteId: id }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
      this.prisma.page.findMany({
        where: { siteId: id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }]
      }),
      this.blocks.list(user, id)
    ])

    const blockNameByKey = new Map(blockList.map((item) => [item.key, item.name]))
    const manifest = this.artifacts.readManifest(site.slug)

    const pageNodes = pages.map((page) => {
      const instances = normalizeBlockInstances(page.blocks)
      const blocks: BlockNode[] = instances.map((item) => ({
        id: item.id,
        key: item.key,
        name: blockNameByKey.get(item.key) ?? item.key,
        enabled: item.enabled,
        missing: !blockNameByKey.has(item.key)
      }))
      const entry = manifest?.pages.find((item) => item.pageId === page.id)
      const current = page.contentHash || ''
      const badge =
        !entry || page.status !== 'published'
          ? page.status === 'published'
            ? 'missing'
            : 'draft'
          : entry.contentHash === current && current === (page.publishedHash || '')
            ? 'published'
            : 'pending'

      return {
        id: page.id,
        type: 'page' as const,
        name: page.title,
        slug: page.slug,
        path: page.path ?? '/',
        sort: page.sort,
        kind: page.kind as 'static' | 'list' | 'detail',
        status: page.status,
        badge,
        hasMissingBlock: blocks.some((item) => item.missing),
        blocks
      }
    })

    const channelNodes = channels.map((channel) => ({
      id: channel.id,
      type: 'channel' as const,
      name: channel.name,
      slug: channel.slug,
      path: channel.path ?? `/${channel.slug}`,
      sort: channel.sort,
      parentId: channel.parentId,
      children: [] as unknown[]
    }))

    const channelById = new Map(channelNodes.map((item) => [item.id, item]))
    const roots: unknown[] = []

    for (const node of channelNodes) {
      const parent = node.parentId ? channelById.get(node.parentId) : null
      if (parent) (parent.children as unknown[]).push(node)
      else roots.push(node)
    }

    // 页面挂到所属目录下（找不到目录的页面挂到根，避免数据异常时整棵树消失）
    for (const page of pageNodes) {
      const parent = channelById.get((pages.find((item) => item.id === page.id)?.channelId ?? '') as string)
      if (parent) (parent.children as unknown[]).push(page)
      else roots.push(page)
    }

    return {
      siteId: id,
      slug: site.slug,
      lastBuiltAt: manifest?.generatedAt ?? null,
      nodes: roots
    }
  }

  // ---------------- 目录 ----------------

  async createChannel(user: AuthUser, dto: CreateChannelDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    this.assertSlug(dto.slug)

    const parent = dto.parentId ? await this.prisma.channel.findUnique({ where: { id: dto.parentId } }) : null
    if (dto.parentId && (!parent || parent.siteId !== siteId)) throw new BadRequestException('上级目录不存在')

    const created = await this.prisma.channel.create({
      data: {
        siteId,
        parentId: parent?.id ?? null,
        name: dto.name,
        slug: dto.slug,
        sort: dto.sort ?? (await this.nextChannelSort(siteId, parent?.id ?? null))
      }
    })
    await this.recomputePaths(siteId)
    return this.prisma.channel.findUnique({ where: { id: created.id } })
  }

  /** 重命名 / 改 slug / 改排序；已发布页面所在目录的 slug 锁定 */
  async updateChannel(user: AuthUser, id: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.channel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('目录不存在')
    assertSiteAccess(user, channel.siteId)

    const data: Record<string, unknown> = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.sort !== undefined) data.sort = dto.sort

    if (dto.slug !== undefined && dto.slug !== channel.slug) {
      this.assertSlug(dto.slug)
      const publishedInside = await this.hasPublishedPageInSubtree(channel.siteId, channel.id)
      if (publishedInside) {
        throw new BadRequestException('该目录下存在已发布页面，目录访问地址不可修改')
      }
      data.slug = dto.slug
    }

    await this.prisma.channel.update({ where: { id }, data })
    if (data.slug) await this.recomputePaths(channel.siteId)
    return this.prisma.channel.findUnique({ where: { id } })
  }

  async removeChannel(user: AuthUser, id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('目录不存在')
    assertSiteAccess(user, channel.siteId)

    const childCount = await this.prisma.channel.count({ where: { parentId: id } })
    if (childCount) throw new BadRequestException('该目录下仍有子目录，请先删除子目录')

    const pageCount = await this.prisma.page.count({ where: { channelId: id } })
    if (pageCount) throw new BadRequestException('该目录下仍有页面，请先删除或移动页面')

    await this.prisma.channel.delete({ where: { id } })
    await this.recomputePaths(channel.siteId)
    return { id }
  }

  async moveChannel(user: AuthUser, id: string, dto: MoveDto) {
    const channel = await this.prisma.channel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('目录不存在')
    assertSiteAccess(user, channel.siteId)
    await this.swapSort('channel', channel.siteId, id, channel.parentId, dto.direction)
    return { id }
  }

  // ---------------- 页面 ----------------

  async createPage(user: AuthUser, dto: CreatePageDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    this.assertSlug(dto.slug)

    const channel = await this.prisma.channel.findUnique({ where: { id: dto.channelId } })
    if (!channel || channel.siteId !== siteId) throw new BadRequestException('所属目录不存在')

    /** slug 唯一范围是「目录内」（[siteId, channelId, slug]），不同目录可以有同名落地页 `index` */
    const existing = await this.prisma.page.findFirst({
      where: { siteId, channelId: channel.id, slug: dto.slug }
    })
    if (existing && !this.isHomeSlug(dto.slug)) {
      throw new BadRequestException(`该目录下已存在 slug 为 ${dto.slug} 的页面`)
    }

    const path = resolvePagePath(channel.path ?? `/${channel.slug}`, dto.slug)
    const created = await this.prisma.page.create({
      data: {
        siteId,
        channelId: channel.id,
        templateId: dto.templateId || 'default',
        title: dto.title,
        slug: dto.slug,
        path,
        kind: dto.kind || 'static',
        status: 'draft',
        summary: dto.summary,
        blocks: [] as never,
        sort: await this.nextPageSort(siteId, channel.id)
      }
    })
    return created
  }

  /** 页面元信息编辑（URL 锁定规则在此落地） */
  async updatePageMeta(user: AuthUser, id: string, dto: UpdatePageMetaDto) {
    const page = await this.prisma.page.findUnique({ where: { id } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)

    const data: Record<string, unknown> = {}
    for (const key of [
      'title',
      'summary',
      'seoTitle',
      'seoDescription',
      'seoKeywords',
      'authorName',
      'kind',
      'jsonLd',
      'jsonLdMode',
      'sort'
    ] as const) {
      if (dto[key] !== undefined) data[key] = dto[key]
    }
    if (dto.editorial !== undefined) data.editorial = dto.editorial

    const changingSlug = dto.slug !== undefined && dto.slug !== page.slug
    const changingChannel = dto.channelId !== undefined && dto.channelId !== page.channelId

    if (page.status === 'published' && (changingSlug || changingChannel)) {
      throw new BadRequestException('已发布页面的访问地址不可修改')
    }
    if (changingSlug) {
      this.assertSlug(String(dto.slug))
      data.slug = dto.slug
    }
    if (changingChannel) {
      const channel = await this.prisma.channel.findUnique({ where: { id: dto.channelId! } })
      if (!channel || channel.siteId !== page.siteId) throw new BadRequestException('目标目录不存在')
      data.channelId = channel.id
    }

    await this.prisma.page.update({ where: { id }, data })
    if (changingSlug || changingChannel) await this.recomputePaths(page.siteId)
    return this.refreshContentHash(id)
  }

  /**
   * 删除页面
   * 已发布页 = 下线：保留记录并写 downAt（交由发布管线清理产物 + 重生成索引），不做 301
   */
  async removePage(user: AuthUser, id: string) {
    const page = await this.prisma.page.findUnique({ where: { id } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)

    if (page.status === 'published') {
      await this.prisma.page.update({
        where: { id },
        data: { status: 'draft', downAt: new Date(), publishedAt: null }
      })
      return { id, offline: true, message: '已发布页不能直接删除，已转为下线：请执行一次发布以清理产物' }
    }

    await this.prisma.page.delete({ where: { id } })
    return { id, offline: false }
  }

  async movePage(user: AuthUser, id: string, dto: MoveDto) {
    const page = await this.prisma.page.findUnique({ where: { id } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)
    await this.swapSort('page', page.siteId, id, page.channelId, dto.direction)
    return { id }
  }

  // ---------------- 草稿（三态之一：保存草稿不构建、不改线上） ----------------

  async getDraft(user: AuthUser, pageId: string) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)
    return { pageId, draft: page.draft ?? null }
  }

  async saveDraft(user: AuthUser, pageId: string, dto: SaveDraftDto) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)

    /**
     * 站点首次引用某个公共块：先把它复制成本站自有块（09 §4.5）。
     * 复制后该块的代码改动只落在本站副本上，其他站点不受影响。
     */
    const usedKeys = (Array.isArray(dto.blocks) ? dto.blocks : [])
      .map((item) => String((item as { key?: string } | null)?.key || ''))
      .filter(Boolean)
    if (usedKeys.length) await this.blocks.copyTemplates(page.siteId, usedKeys)

    const draft = {
      ...(dto.draft || {}),
      ...(dto.blocks ? { blocks: dto.blocks } : {}),
      updatedAt: formatDateTime(new Date())
    }

    await this.prisma.page.update({ where: { id: pageId }, data: { draft: toJsonInput(draft) } })
    return { pageId, draft }
  }

  async deleteDraft(user: AuthUser, pageId: string) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException('页面不存在')
    assertSiteAccess(user, page.siteId)
    await this.prisma.page.update({ where: { id: pageId }, data: { draft: null } })
    return { pageId }
  }

  // ---------------- 内部：路径物化 / 内容指纹 ----------------

  /** 重算整站目录与页面路径（先清空再回填，规避唯一约束中间态冲突） */
  async recomputePaths(siteId: string) {
    const channels = await this.prisma.channel.findMany({ where: { siteId }, orderBy: [{ id: 'asc' }] })
    const channelById = new Map(channels.map((item) => [item.id, item]))
    const resolved = new Map<string, string>()

    const resolveChannelPath = (channelId: string, seen = new Set<string>()): string => {
      if (resolved.has(channelId)) return resolved.get(channelId) as string
      const channel = channelById.get(channelId)
      if (!channel || seen.has(channelId)) return ''
      seen.add(channelId)
      const path = channel.parentId
        ? `${resolveChannelPath(channel.parentId, seen)}/${channel.slug}`
        : `/${channel.slug}`
      resolved.set(channelId, path)
      return path
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.channel.updateMany({ where: { siteId }, data: { path: null } })
      await tx.page.updateMany({ where: { siteId }, data: { path: null } })

      for (const channel of channels) {
        await tx.channel.update({ where: { id: channel.id }, data: { path: resolveChannelPath(channel.id) } })
      }

      const pages = await tx.page.findMany({ where: { siteId }, select: { id: true, slug: true, channelId: true } })
      for (const page of pages) {
        const path = resolvePagePath(resolveChannelPath(page.channelId), page.slug)
        await tx.page.update({ where: { id: page.id }, data: { path } })
      }
    })
  }

  /** 重算页面内容指纹并回写（内容改变时调用） */
  async refreshContentHash(pageId: string) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException('页面不存在')
    const codeHashMap = await this.blocks.codeHashMap(page.siteId)
    const contentHash = computePageContentHash(
      {
        title: page.title,
        slug: page.slug,
        path: page.path,
        kind: page.kind,
        summary: page.summary,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        seoKeywords: page.seoKeywords,
        authorName: page.authorName,
        editorial: page.editorial,
        blocks: page.blocks
      },
      (key) => codeHashMap.get(key) ?? ''
    )
    return this.prisma.page.update({ where: { id: pageId }, data: { contentHash } })
  }

  /** 批量重算站点内全部页面的内容指纹（块代码变更后调用） */
  async refreshSiteContentHashes(siteId: string) {
    const pages = await this.prisma.page.findMany({ where: { siteId }, select: { id: true } })
    for (const page of pages) await this.refreshContentHash(page.id)
    return { siteId, count: pages.length }
  }

  // ---------------- 内部：排序 / 校验 ----------------

  private isHomeSlug(slug: string): boolean {
    return slug === 'home' || slug === 'index'
  }

  private assertSlug(slug: string) {
    if (!isValidPathSegment(slug) && !this.isHomeSlug(slug)) {
      throw new BadRequestException(`路径片段非法：${slug}（只允许小写字母、数字与连字符，且不以连字符开头）`)
    }
  }

  private async nextChannelSort(siteId: string, parentId: string | null): Promise<number> {
    const max = await this.prisma.channel.aggregate({
      where: { siteId, parentId },
      _max: { sort: true }
    })
    return (max._max.sort ?? 0) + 1
  }

  private async nextPageSort(siteId: string, channelId: string): Promise<number> {
    const max = await this.prisma.page.aggregate({ where: { siteId, channelId }, _max: { sort: true } })
    return (max._max.sort ?? 0) + 1
  }

  /** 目录子树内是否存在已发布页面 */
  private async hasPublishedPageInSubtree(siteId: string, channelId: string): Promise<boolean> {
    const ids = await this.collectChannelSubtree(siteId, channelId)
    const count = await this.prisma.page.count({ where: { siteId, channelId: { in: ids }, status: 'published' } })
    return count > 0
  }

  private async collectChannelSubtree(siteId: string, rootId: string): Promise<string[]> {
    const channels = await this.prisma.channel.findMany({ where: { siteId }, select: { id: true, parentId: true } })
    const childrenOf = new Map<string, string[]>()
    for (const channel of channels) {
      if (channel.parentId) {
        const list = childrenOf.get(channel.parentId) ?? []
        list.push(channel.id)
        childrenOf.set(channel.parentId, list)
      }
    }
    const result: string[] = []
    const queue = [rootId]
    while (queue.length) {
      const current = queue.shift() as string
      result.push(current)
      queue.push(...(childrenOf.get(current) ?? []))
    }
    return result
  }

  /** 同级上下移：与相邻项互换 sort */
  private async swapSort(
    kind: 'channel' | 'page',
    siteId: string,
    id: string,
    scopeId: string | null,
    direction: 'up' | 'down'
  ) {
    if (kind === 'channel') {
      const siblings = await this.prisma.channel.findMany({
        where: { siteId, parentId: scopeId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }]
      })
      const index = siblings.findIndex((item) => item.id === id)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || target < 0 || target >= siblings.length) return
      const current = siblings[index]
      const other = siblings[target]
      await this.prisma.$transaction([
        this.prisma.channel.update({ where: { id: current.id }, data: { sort: other.sort } }),
        this.prisma.channel.update({ where: { id: other.id }, data: { sort: current.sort } })
      ])
      return
    }

    const siblings = await this.prisma.page.findMany({
      where: { siteId, channelId: scopeId as string },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    const index = siblings.findIndex((item) => item.id === id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= siblings.length) return
    const current = siblings[index]
    const other = siblings[target]
    await this.prisma.$transaction([
      this.prisma.page.update({ where: { id: current.id }, data: { sort: other.sort } }),
      this.prisma.page.update({ where: { id: other.id }, data: { sort: current.sort } })
    ])
  }
}
