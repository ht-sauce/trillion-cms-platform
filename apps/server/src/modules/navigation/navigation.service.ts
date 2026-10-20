/**
 * 导航配置服务（独立配置数据，不从内容树推导，见 ADR-029）
 *
 * 分组固定 5 个：header + footer-1 ~ footer-4。读取时若分组不存在则自动补齐空分组，
 * 保证后台导航管理页永远渲染出完整五列，运营不会因为「分组不存在」而无法编辑。
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { NAVIGATION_KEY_LABELS, NAVIGATION_KEYS, type NavigationKey } from '@trillion/shared'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import type { SaveNavigationDto } from './dto'

@Injectable()
export class NavigationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取站点全部导航分组（缺省分组自动补齐；并回填页面路径与失效标记） */
  async list(user: AuthUser, siteId: string) {
    const id = siteId
    assertSiteAccess(user, id)
    await this.ensureGroups(id)
    return this.loadGroups(id, false)
  }

  /**
   * 站点渲染用：只返回启用项，且剔除失效项（既无链接又无页面 / 页面已下线）
   * GEO 渲染引擎构建期与 SSR 运行时共用
   */
  async resolve(siteId: string) {
    const id = siteId
    const groups = await this.loadGroups(id, true)
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => !item.invalid) }))
      .filter((group) => group.items.length > 0)
  }

  /** 整组全量覆盖保存 */
  async save(user: AuthUser, key: string, dto: SaveNavigationDto) {
    const siteId = dto.siteId
    assertSiteAccess(user, siteId)
    if (!NAVIGATION_KEYS.includes(key as NavigationKey)) {
      throw new BadRequestException(`未知导航分组：${key}`)
    }

    const navigationKey = key as NavigationKey
    await this.ensureGroups(siteId)
    const group = await this.prisma.navigation.findUnique({
      where: { siteId_key: { siteId, key: navigationKey } }
    })
    if (!group) throw new NotFoundException('导航分组不存在')

    // 校验站内跳转的页面确实属于本站，避免把别的站点的 pageId 挂进来
    const pageIds = dto.items.map((item) => item.pageId).filter((value): value is string => typeof value === 'string')
    if (pageIds.length) {
      const count = await this.prisma.page.count({ where: { siteId, id: { in: pageIds } } })
      const unique = new Set(pageIds)
      if (count !== unique.size) {
        throw new BadRequestException('导航项引用的页面不属于该站点，或页面不存在')
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.navigation.update({
        where: { id: group.id },
        data: { title: dto.title || NAVIGATION_KEY_LABELS[navigationKey] }
      })
      // 全量覆盖：先清空再写入，保证顺序与前端拖拽结果一致
      await tx.navigationItem.deleteMany({ where: { navigationId: group.id } })
      if (dto.items.length) {
        await tx.navigationItem.createMany({
          data: dto.items.map((item, index) => ({
            navigationId: group.id,
            label: item.label,
            pageId: item.pageId ?? null,
            href: item.href ?? null,
            sort: index,
            status: item.status ?? 'active'
          }))
        })
      }
    })

    return this.loadGroups(siteId, false)
  }

  // ---------------- 内部 ----------------

  /** 补齐 5 个固定分组（幂等，用 upsert 避免并发重复创建） */
  private async ensureGroups(siteId: string) {
    for (const [index, key] of NAVIGATION_KEYS.entries()) {
      await this.prisma.navigation.upsert({
        where: { siteId_key: { siteId, key } },
        update: {},
        create: { siteId, key, title: NAVIGATION_KEY_LABELS[key], sort: index }
      })
    }
  }

  /**
   * 装载分组与导航项
   * @param activeOnly 站点渲染用：只取启用项
   */
  private async loadGroups(siteId: string, activeOnly: boolean) {
    const groups = await this.prisma.navigation.findMany({
      where: { siteId },
      orderBy: { sort: 'asc' },
      include: {
        items: {
          where: activeOnly ? { status: 'active' } : {},
          orderBy: { sort: 'asc' }
        }
      }
    })

    // 一次性解析被引用的页面路径，避免逐条查询
    const pageIds = groups
      .flatMap((group) => group.items.map((item) => item.pageId))
      .filter((value): value is string => value !== null)
    const pages = pageIds.length
      ? await this.prisma.page.findMany({
          where: { id: { in: pageIds } },
          select: { id: true, path: true, status: true, title: true }
        })
      : []
    const pageMap = new Map(pages.map((page) => [page.id, page]))

    return groups.map((group) => ({
      id: group.id,
      siteId: group.siteId,
      key: group.key as NavigationKey,
      title: group.title,
      sort: group.sort,
      items: group.items.map((item) => {
        const page = item.pageId === null ? null : pageMap.get(item.pageId)
        const pagePath = page?.path ?? null
        /** 失效判定：既无站内页面也无外部链接，或指向的页面不存在 / 未发布 */
        const invalid = !item.href && (!page || page.status !== 'published')
        return {
          id: item.id,
          navigationId: item.navigationId,
          label: item.label,
          pageId: item.pageId,
          href: item.href,
          sort: item.sort,
          status: item.status as 'active' | 'disabled',
          pagePath,
          title: page?.title ?? null,
          invalid
        }
      })
    }))
  }
}
