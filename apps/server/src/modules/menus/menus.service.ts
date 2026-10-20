/**
 * 菜单服务：菜单树查询（按当前用户角色的菜单授权过滤）+ 菜单配置维护
 * 可见性来源：用户 →（roleId）角色 →（RoleMenu）菜单；菜单本身不再区分平台级
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { MenuStatus, MenuTreeNode } from '@trillion/shared'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { formatDateTime } from '../../common/utils/datetime'
import type { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './dto'

/** 菜单最大层级（一级 ~ 三级） */
const MAX_LEVEL = 3

/** 菜单表记录（避免直接依赖 Prisma 生成的模型类型） */
interface MenuRecord {
  id: string
  parentId: string | null
  title: string
  path: string | null
  sort: number
  visible: boolean
  status: string
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  /** 侧栏菜单树：取当前用户角色授权的菜单（启用 + 可见），并组装为最多三级的树 */
  async tree(user: AuthUser): Promise<MenuTreeNode[]> {
    const granted = await this.prisma.roleMenu.findMany({
      where: { roleId: user.roleId },
      select: { menuId: true }
    })
    const menuIds = granted.map((item) => item.menuId)
    if (!menuIds.length) return []

    const list = await this.prisma.menu.findMany({
      where: { id: { in: menuIds }, status: 'active', visible: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    return this.buildTree(list as MenuRecord[])
  }

  /** 菜单平铺列表（菜单管理页，含隐藏与停用项） */
  async list(query: QueryMenuDto) {
    const where: Record<string, unknown> = {}
    if (query.status) where.status = query.status
    const list = await this.prisma.menu.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    return { list: (list as MenuRecord[]).map((item) => this.toView(item)), total: list.length }
  }

  /** 新建菜单（仅平台级角色） */
  async create(dto: CreateMenuDto) {
    const parentId = dto.parentId ?? null
    if (parentId) await this.assertCanAttach(parentId, 1)

    const menu = await this.prisma.menu.create({
      data: {
        parentId,
        title: dto.title,
        path: dto.path || null,
        sort: dto.sort ?? 0,
        visible: dto.visible ?? true,
        status: dto.status || 'active'
      }
    })
    return this.toView(menu as MenuRecord)
  }

  /** 编辑菜单（仅平台级角色）：阻止循环引用并守住三级上限 */
  async update(id: string, dto: UpdateMenuDto) {
    const current = await this.prisma.menu.findUnique({ where: { id }, select: { id: true } })
    if (!current) throw new NotFoundException('菜单不存在')

    if (dto.parentId !== undefined && (dto.parentId ?? null) !== null) {
      const parentId = dto.parentId as string
      if (parentId === id) throw new BadRequestException('上级菜单不能是自身')
      if (await this.isDescendant(parentId, id)) throw new BadRequestException('上级菜单不能是自己的子菜单')
      await this.assertCanAttach(parentId, await this.subtreeHeight(id))
    }

    const menu = await this.prisma.menu.update({
      where: { id },
      data: {
        ...(dto.parentId !== undefined ? { parentId: dto.parentId ?? null } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.path !== undefined ? { path: dto.path || null } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      }
    })
    return this.toView(menu as MenuRecord)
  }

  /** 删除菜单（仅平台级角色）：存在子菜单时拒绝，避免误删整棵子树 */
  async remove(id: string) {
    const exists = await this.prisma.menu.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('菜单不存在')

    const childCount = await this.prisma.menu.count({ where: { parentId: id } })
    if (childCount > 0) throw new BadRequestException('请先删除子菜单')

    /** 角色授权记录由 RoleMenu 的级联删除一并清理 */
    await this.prisma.menu.delete({ where: { id } })
    return { id }
  }

  /** 平铺列表转多级树；父级未授权（被过滤）的节点一并丢弃，不越级暴露 */
  private buildTree(list: MenuRecord[]): MenuTreeNode[] {
    const map = new Map<string, MenuTreeNode>()
    for (const item of list) {
      map.set(item.id, {
        id: item.id,
        parentId: item.parentId,
        title: item.title,
        path: item.path,
        sort: item.sort,
        visible: item.visible,
        status: item.status as MenuStatus,
        children: []
      })
    }

    const roots: MenuTreeNode[] = []
    for (const item of list) {
      const node = map.get(item.id)
      if (!node) continue
      if (!item.parentId) {
        roots.push(node)
        continue
      }
      const parent = map.get(item.parentId)
      if (parent) parent.children.push(node)
    }
    return roots
  }

  /** 计算菜单自身层级（一级 = 1），不存在直接 404 */
  private async levelOf(id: string, depth = 1): Promise<number> {
    if (depth > MAX_LEVEL) throw new BadRequestException(`菜单最多 ${MAX_LEVEL} 级`)
    const node = await this.prisma.menu.findUnique({ where: { id }, select: { parentId: true } })
    if (!node) throw new NotFoundException('上级菜单不存在')
    return node.parentId ? this.levelOf(node.parentId, depth + 1) : depth
  }

  /** 校验能否把高度为 childHeight 的子树挂到 parentId 下（不超三级） */
  private async assertCanAttach(parentId: string, childHeight: number) {
    const level = await this.levelOf(parentId)
    if (level + childHeight > MAX_LEVEL) {
      throw new BadRequestException(`菜单最多 ${MAX_LEVEL} 级，当前上级已处于第 ${level} 级`)
    }
  }

  /** 自身子树高度（叶子 = 1） */
  private async subtreeHeight(id: string): Promise<number> {
    const children = await this.prisma.menu.findMany({ where: { parentId: id }, select: { id: true } })
    if (!children.length) return 1
    const heights = await Promise.all(children.map((child) => this.subtreeHeight(child.id)))
    return 1 + Math.max(...heights)
  }

  /** 判断 candidateId 是否位于 id 的子树内（用于阻止把父级设为自己的后代） */
  private async isDescendant(candidateId: string, id: string): Promise<boolean> {
    let cursor: string | null = candidateId
    for (let i = 0; i <= MAX_LEVEL && cursor; i += 1) {
      if (cursor === id) return true
      const node: { parentId: string | null } | null = await this.prisma.menu.findUnique({
        where: { id: cursor },
        select: { parentId: true }
      })
      cursor = node?.parentId ?? null
    }
    return false
  }

  /** 统一对外视图：时间转中国时区字符串 */
  private toView(menu: MenuRecord) {
    return {
      id: menu.id,
      parentId: menu.parentId,
      title: menu.title,
      path: menu.path,
      sort: menu.sort,
      visible: menu.visible,
      status: menu.status as MenuStatus,
      createdAt: formatDateTime(menu.createdAt),
      updatedAt: formatDateTime(menu.updatedAt)
    }
  }
}
