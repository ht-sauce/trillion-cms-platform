/**
 * 实体服务：品牌/产品/机构的规范名称与别名维护
 */
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { siteIdWhere } from '../../common/utils/site-scope'

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 实体列表 */
  async list(user: AuthUser, siteId?: string, keyword?: string) {
    const where: Record<string, unknown> = { ...siteIdWhere(user, siteId) }
    if (keyword) where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }]
    return this.prisma.entity.findMany({ where, orderBy: { id: 'desc' } })
  }

  /** 新增实体 */
  async create(data: { siteId?: string; name: string; aliases: unknown; type?: string; description?: string }) {
    return this.prisma.entity.create({
      data: {
        siteId: data.siteId ?? null,
        name: data.name,
        aliases: (data.aliases ?? []) as never,
        type: data.type || 'brand',
        description: data.description
      }
    })
  }

  /** 更新实体 */
  async update(id: string, data: Record<string, unknown>) {
    const exists = await this.prisma.entity.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('实体不存在')
    return this.prisma.entity.update({ where: { id }, data: data as never })
  }

  /** 删除实体 */
  async remove(id: string) {
    await this.prisma.entity.delete({ where: { id } })
    return { id }
  }
}
