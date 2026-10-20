/**
 * 静态文件服务
 * - 上传：写入 uploads/<yyyy>/<mm>/<uuid>.<ext>，同时记录库（URL 表）
 * - 列表：按站点 + 关键字筛选
 * - 删除：删库记录与物理文件
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { siteIdWhere } from '../../common/utils/site-scope'
import { PAGE_DEFAULT, PAGE_SIZE_DEFAULT } from '../../common/constants'

/** 允许上传的 MIME 类型白名单（素材库仅收常用图片格式，与 admin 端 IMAGE_ACCEPT 口径一致） */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon']

/** 单文件最大体积 1MB */
const MAX_SIZE = 1024 * 1024

@Injectable()
export class StaticFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  /**
   * 保存上传文件
   * @param user 当前登录用户（记录上传人）
   * @param file multer 文件对象
   * @param siteId 归属站点，可空表示平台级公共文件
   * @param caption 图片备注（可选，标识素材引用位置）
   */
  async upload(user: AuthUser, file: Express.Multer.File, siteId?: string, caption?: string) {
    if (!file) throw new BadRequestException('未接收到文件')
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(`不支持的文件类型：${file.mimetype}`)
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('文件超过 1MB 上限')
    }

    const uploadDir = this.config.get<string>('upload.dir') || 'uploads'
    const publicPrefix = this.config.get<string>('upload.publicPrefix') || '/static'
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const ext = path.extname(file.originalname) || ''
    const name = `${randomUUID()}${ext}`
    const relativeDir = `${year}/${month}`
    const targetDir = path.join(process.cwd(), uploadDir, relativeDir)

    fs.mkdirSync(targetDir, { recursive: true })
    const storagePath = `${uploadDir}/${relativeDir}/${name}`
    fs.writeFileSync(path.join(process.cwd(), storagePath), file.buffer)

    return this.prisma.staticFile.create({
      data: {
        siteId: siteId || null,
        originalName: file.originalname,
        storagePath,
        publicUrl: `${publicPrefix}/${relativeDir}/${name}`,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        width: null,
        height: null,
        caption: caption?.trim() || null,
        uploadedBy: user?.id ?? null
      }
    })
  }

  /** 静态文件列表 */
  async list(user: AuthUser, siteId?: string, keyword?: string, page = PAGE_DEFAULT, pageSize = PAGE_SIZE_DEFAULT) {
    const where: Record<string, unknown> = { ...siteIdWhere(user, siteId) }
    if (keyword) where.OR = [{ originalName: { contains: keyword } }, { publicUrl: { contains: keyword } }]

    const [list, total] = await Promise.all([
      this.prisma.staticFile.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' }
      }),
      this.prisma.staticFile.count({ where })
    ])
    return { list, total, page, pageSize }
  }

  /**
   * 替换文件内容：保持 StaticFile 记录与 publicUrl（物理路径名）不变，
   * 仅覆盖物理文件并更新 sizeBytes / originalName / mimeType 等字段。
   * 新文件 MIME 必须与原记录一致（URL 对外承诺的文件类型不能悄悄变化），
   * 白名单与 10MB 上限沿用上传口径。
   */
  async replace(user: AuthUser, id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('未接收到文件')
    const record = await this.prisma.staticFile.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('文件不存在')

    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(`不支持的文件类型：${file.mimetype}`)
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('文件超过 1MB 上限')
    }
    if (file.mimetype !== record.mimeType) {
      throw new BadRequestException(`文件类型不一致：原文件为 ${record.mimeType}，新文件为 ${file.mimetype}`)
    }

    const abs = path.join(process.cwd(), record.storagePath)
    if (!fs.existsSync(abs)) throw new NotFoundException('物理文件已丢失，无法替换，请重新上传')
    fs.writeFileSync(abs, file.buffer)

    return this.prisma.staticFile.update({
      where: { id },
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: user?.id ?? record.uploadedBy
      }
    })
  }

  /** 更新图片备注（标识素材引用位置），传空串即清空 */
  async updateCaption(id: string, caption?: string) {
    const record = await this.prisma.staticFile.findUnique({ where: { id } })
    if (!record) throw new NotFoundException('文件不存在')
    return this.prisma.staticFile.update({
      where: { id },
      data: { caption: caption?.trim() || null }
    })
  }

  /** 删除静态文件（同时清理物理文件） */
  async remove(id: string) {
    const file = await this.prisma.staticFile.findUnique({ where: { id } })
    if (!file) throw new NotFoundException('文件不存在')
    const abs = path.join(process.cwd(), file.storagePath)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
    await this.prisma.staticFile.delete({ where: { id } })
    return { id }
  }
}
