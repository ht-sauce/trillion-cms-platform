/**
 * 会员服务：站点会员的列表 / 新增 / 启停
 * 注意：会员登录（JWT-M）在 site-auth 模块，本模块只处理管理侧会员数据
 */
import { Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess, siteIdWhere } from '../../common/utils/site-scope'
import { PAGE_DEFAULT, PAGE_SIZE_DEFAULT } from '../../common/constants'

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会员列表（按站点隔离） */
  async list(user: AuthUser, siteId: string, keyword?: string, page = PAGE_DEFAULT, pageSize = PAGE_SIZE_DEFAULT) {
    const where: Record<string, unknown> = { siteId, ...siteIdWhere(user, siteId) }
    if (keyword) where.OR = [{ username: { contains: keyword } }, { nickname: { contains: keyword } }]

    const [list, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
        select: { id: true, siteId: true, username: true, nickname: true, createdAt: true }
      }),
      this.prisma.member.count({ where })
    ])
    return { list, total, page, pageSize }
  }

  /** 管理侧新增会员 */
  async create(user: AuthUser, siteId: string, username: string, password: string, nickname?: string) {
    assertSiteAccess(user, siteId)
    return this.prisma.member.create({
      data: { siteId, username, nickname, password: await bcrypt.hash(password, 10) },
      select: { id: true, siteId: true, username: true, nickname: true, createdAt: true }
    })
  }

  /** 删除会员 */
  async remove(user: AuthUser, id: string) {
    const member = await this.prisma.member.findUnique({ where: { id } })
    if (!member) throw new NotFoundException('会员不存在')
    assertSiteAccess(user, member.siteId)
    await this.prisma.member.delete({ where: { id } })
    return { id }
  }
}
