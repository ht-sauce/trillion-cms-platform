/**
 * 角色服务：角色 CRUD + 角色-菜单授权
 * 权限模型：用户 →（绑定）角色 →（授权）菜单；本模块是「角色 → 菜单」这一段的管理入口
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { RoleStatus } from '@trillion/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { formatDateTime } from '../../common/utils/datetime'
import type { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './dto'

/** 角色表记录 */
interface RoleRecord {
  id: string
  code: string
  name: string
  description: string | null
  platform: boolean
  builtin: boolean
  status: string
  sort: number
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 角色列表（含已授权菜单 ID 与绑定用户数，供角色管理页回显） */
  async list(query: QueryRoleDto) {
    const where: Record<string, unknown> = {}
    if (query.status) where.status = query.status
    if (query.keyword) {
      where.OR = [{ name: { contains: query.keyword } }, { code: { contains: query.keyword } }]
    }

    const list = await this.prisma.role.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        menus: { select: { menuId: true } },
        _count: { select: { users: true } }
      }
    })

    return {
      list: list.map((item) => ({
        ...this.toView(item as RoleRecord),
        menuIds: item.menus.map((menu) => menu.menuId),
        userCount: item._count.users
      })),
      total: list.length
    }
  }

  /** 新建角色（仅平台级角色）：不允许通过接口创建内置角色 */
  async create(dto: CreateRoleDto) {
    await this.assertCodeAvailable(dto.code)
    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description || null,
        platform: dto.platform ?? false,
        builtin: false,
        status: dto.status || 'active',
        sort: dto.sort ?? 0
      }
    })
    return { ...this.toView(role as RoleRecord), menuIds: [], userCount: 0 }
  }

  /** 编辑角色（仅平台级角色） */
  async update(id: string, dto: UpdateRoleDto) {
    const current = await this.prisma.role.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('角色不存在')

    /** 内置角色的标识与可用性受保护：改 code 会让代码引用漂移，停用会让系统失去管理入口 */
    if (current.builtin) {
      if (dto.code !== undefined && dto.code !== current.code) {
        throw new BadRequestException('内置角色不允许修改角色标识')
      }
      if (dto.status === 'disabled') throw new BadRequestException('内置角色不允许停用')
    }
    if (dto.code && dto.code !== current.code) await this.assertCodeAvailable(dto.code)

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {})
      },
      include: { menus: { select: { menuId: true } }, _count: { select: { users: true } } }
    })
    return {
      ...this.toView(role as RoleRecord),
      menuIds: role.menus.map((menu) => menu.menuId),
      userCount: role._count.users
    }
  }

  /** 删除角色（仅平台级角色）：内置角色与仍有用户绑定的角色不可删 */
  async remove(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!role) throw new NotFoundException('角色不存在')
    if (role.builtin) throw new BadRequestException('内置角色不允许删除')
    if (role._count.users > 0) throw new BadRequestException('该角色下仍有用户，请先调整这些用户的角色')

    /** 角色-菜单授权记录由 RoleMenu 的级联删除一并清理 */
    await this.prisma.role.delete({ where: { id } })
    return { id }
  }

  /** 保存角色的菜单授权（覆盖式，自动补全祖先菜单以保证侧栏可正确建树） */
  async saveMenus(id: string, menuIds: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id }, select: { id: true } })
    if (!role) throw new NotFoundException('角色不存在')

    const finalIds = await this.withAncestors(menuIds)
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      ...(finalIds.length
        ? [this.prisma.roleMenu.createMany({ data: finalIds.map((menuId) => ({ roleId: id, menuId })) })]
        : [])
    ])

    const menus = await this.prisma.roleMenu.findMany({ where: { roleId: id }, select: { menuId: true } })
    return { id, menuIds: menus.map((item) => item.menuId) }
  }

  /** 角色标识唯一性校验 */
  private async assertCodeAvailable(code: string) {
    const exists = await this.prisma.role.findUnique({ where: { code }, select: { id: true } })
    if (exists) throw new BadRequestException(`角色标识「${code}」已存在`)
  }

  /** 补全祖先菜单：授权子菜单时自动带上其所有上级，避免侧栏出现"授权了却看不到" */
  private async withAncestors(menuIds: string[]): Promise<string[]> {
    const all = await this.prisma.menu.findMany({ select: { id: true, parentId: true } })
    const parentMap = new Map(all.map((item) => [item.id, item.parentId]))
    const result = new Set(menuIds.filter((id) => parentMap.has(id)))

    for (const id of [...result]) {
      let cursor = parentMap.get(id) ?? null
      while (cursor) {
        result.add(cursor)
        cursor = parentMap.get(cursor) ?? null
      }
    }
    return [...result]
  }

  /** 统一对外视图：时间转中国时区字符串 */
  private toView(role: RoleRecord) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      platform: role.platform,
      builtin: role.builtin,
      status: role.status as RoleStatus,
      sort: role.sort,
      createdAt: formatDateTime(role.createdAt),
      updatedAt: formatDateTime(role.updatedAt)
    }
  }
}
