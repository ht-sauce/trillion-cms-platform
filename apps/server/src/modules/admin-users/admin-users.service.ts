/**
 * 后台用户服务：用户 CRUD 与「用户 → 角色」绑定
 * 安全护栏：不允许删除自己；系统必须始终保留至少一个平台级用户，避免管理入口自锁
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { formatDateTime } from '../../common/utils/datetime'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { toJsonInput } from '../../common/utils/json'
import { normalizePage, normalizePageSize } from '../../common/constants'
import type { CreateAdminUserDto, QueryAdminUserDto, UpdateAdminUserDto } from './dto'

/** 用户表记录（关联角色） */
interface UserRecord {
  id: string
  username: string
  displayName: string | null
  roleId: string
  siteIds: unknown
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  role: { id: string; code: string; name: string; platform: boolean }
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 用户列表（分页 + 关键字 + 角色筛选，永不返回密码） */
  async list(query: QueryAdminUserDto) {
    const page = normalizePage(query.page)
    const pageSize = normalizePageSize(query.pageSize)
    const where: Record<string, unknown> = {}

    if (query.keyword) {
      where.OR = [{ username: { contains: query.keyword } }, { displayName: { contains: query.keyword } }]
    }
    if (query.roleId) where.roleId = query.roleId

    const [list, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'asc' },
        include: { role: { select: { id: true, code: true, name: true, platform: true } } }
      }),
      this.prisma.adminUser.count({ where })
    ])

    return { list: list.map((item) => this.toView(item as UserRecord)), total, page, pageSize }
  }

  /** 新建用户（仅平台级角色） */
  async create(dto: CreateAdminUserDto) {
    const exists = await this.prisma.adminUser.findUnique({ where: { username: dto.username }, select: { id: true } })
    if (exists) throw new BadRequestException(`账号「${dto.username}」已存在`)
    await this.assertRole(dto.roleId)

    const user = await this.prisma.adminUser.create({
      data: {
        username: dto.username,
        password: await bcrypt.hash(dto.password, 10),
        displayName: dto.displayName || null,
        roleId: dto.roleId,
        siteIds: toJsonInput(dto.siteIds ?? []),
        enabled: dto.enabled ?? true
      },
      include: { role: { select: { id: true, code: true, name: true, platform: true } } }
    })
    return this.toView(user as UserRecord)
  }

  /** 编辑用户（仅平台级角色）：账号不可改，密码留空表示不修改 */
  async update(id: string, dto: UpdateAdminUserDto) {
    const current = await this.prisma.adminUser.findUnique({ where: { id }, include: { role: true } })
    if (!current) throw new NotFoundException('用户不存在')

    if (dto.roleId !== undefined && dto.roleId !== current.roleId) {
      await this.assertRole(dto.roleId)
      /** 防止把最后一个平台级用户降级为普通角色，导致无人可管理平台 */
      if (current.role.platform) await this.assertPlatformUserKept('调整角色')
    }
    if (dto.enabled === false && current.role.platform) await this.assertPlatformUserKept('停用')

    const user = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.password ? { password: await bcrypt.hash(dto.password, 10) } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName || null } : {}),
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.siteIds !== undefined ? { siteIds: toJsonInput(dto.siteIds) } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
      },
      include: { role: { select: { id: true, code: true, name: true, platform: true } } }
    })
    return this.toView(user as UserRecord)
  }

  /** 删除用户（仅平台级角色）：不允许删除自己，且始终保留一个平台级用户 */
  async remove(currentUser: AuthUser, id: string) {
    if (currentUser.id === id) throw new BadRequestException('不能删除当前登录账号')

    const user = await this.prisma.adminUser.findUnique({ where: { id }, include: { role: true } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.role.platform) await this.assertPlatformUserKept('删除')

    await this.prisma.adminUser.delete({ where: { id } })
    return { id }
  }

  /** 校验角色存在且启用 */
  private async assertRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { status: true } })
    if (!role) throw new BadRequestException('绑定的角色不存在')
    if (role.status !== 'active') throw new BadRequestException('绑定的角色已停用')
  }

  /** 保证系统仍保留至少一个可用的平台级用户 */
  private async assertPlatformUserKept(action: string) {
    const count = await this.prisma.adminUser.count({
      where: { enabled: true, role: { platform: true, status: 'active' } }
    })
    if (count <= 1) throw new BadRequestException(`系统必须保留至少一个可用的平台级用户，无法执行${action}`)
  }

  /** 统一对外视图：站点 ID 数组化、时间转中国时区字符串，不含密码 */
  private toView(user: UserRecord) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleId: user.roleId,
      roleCode: user.role.code,
      roleName: user.role.name,
      platform: user.role.platform,
      siteIds: Array.isArray(user.siteIds) ? (user.siteIds as string[]) : [],
      enabled: user.enabled,
      createdAt: formatDateTime(user.createdAt),
      updatedAt: formatDateTime(user.updatedAt)
    }
  }
}
