/**
 * 块定义服务：块代码的唯一事实来源
 *
 * 能力（见 docs/spec/09-site-editor.md §4.2 / §4.5 / §6.4）：
 *   - 列表 / 详情（本站块 + 公共模板）
 *   - 新建 / 保存（编译校验 + 声明抽取 + 版本留档）
 *   - 使用位置（哪些页面引用了该块）
 *   - 回退上一版
 *   - 给渲染引擎的内部清单（落盘 .blocks/ 用）
 *
 * **块隔离（09 §4.5）**：公共块（siteId = '0'）只作模板，不再是站点的渲染来源。
 * 站点引用某个块时先复制成本站自有块，之后的代码改动只落在站点副本上，站点之间互不影响；
 * 写入站点维度时若副本不存在会自动复制（`ensure` 语义），因此运营不必先「手动引入」。
 *
 * 权限：读=站点级；写站点块=站点级；写公共模板=平台级（siteId='0' 的访问由 assertSiteAccess 拦截）
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSiteAccess } from '../../common/utils/site-scope'
import { computeCodeHash, normalizeBlockInstances } from '../../common/utils/content-hash'
import { toJsonInput } from '../../common/utils/json'
import { blockFileName } from '@trillion/shared'
import { compileSfc } from '../../common/workers/sfc-compile'
import { PUBLIC_BLOCK_SITE_ID } from './constants'
import { copyTemplatesToSite, type CopyTemplatesResult } from './block-copy'

/** 公共块 siteId 常量（= 模板库）定义在 constants.ts；这里再导出，保持既有引用路径可用 */
export { PUBLIC_BLOCK_SITE_ID }

/** 同名块排序：公共模板在前、站点副本在后（map 赋值时后者覆盖前者，实现「站点副本优先」） */
export function sortPublicFirst<T extends { siteId: string }>(a: T, b: T): number {
  if (a.siteId === b.siteId) return 0
  return a.siteId === PUBLIC_BLOCK_SITE_ID ? -1 : 1
}

/** 内置块清单项（后台块库卡片） */
export interface BlockListItem {
  id: string
  key: string
  name: string
  hint: string
  scope: string
  siteId: string
  codeHash: string
  compileStatus: string
  compileError: string | null
  version: number
  updatedAt: Date
  fieldCount: number
  /** 站点私有块与公共块同名时，前端需能区分 */
  isSiteScoped: boolean
}

@Injectable()
export class BlocksService {
  private readonly logger = new Logger('Blocks')

  constructor(private readonly prisma: PrismaService) {}

  // ---------------- 查询 ----------------

  /**
   * 块库列表：公共模板（siteId = '0'）+ 本站自有块
   * 同一个 key 会同时出现两行（模板 + 本站副本），前端据此判断「该模板是否已引入本站」
   */
  async list(user: AuthUser, siteId: string): Promise<BlockListItem[]> {
    const id = siteId
    assertSiteAccess(user, id)

    const blocks = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId: id }] },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }]
    })

    return blocks.map((block) => {
      const declaration = (block.declaration || {}) as { fields?: unknown[] }
      return {
        id: block.id,
        key: block.key,
        name: block.name,
        hint: block.hint,
        scope: block.scope,
        siteId: block.siteId,
        codeHash: block.codeHash,
        compileStatus: block.compileStatus,
        compileError: block.compileError,
        version: block.version,
        updatedAt: block.updatedAt,
        fieldCount: Array.isArray(declaration.fields) ? declaration.fields.length : 0,
        isSiteScoped: block.siteId !== PUBLIC_BLOCK_SITE_ID
      }
    })
  }

  /**
   * 块详情（含源码与声明）
   * @param options.template 只读公共模板（块模板库用）；缺省按「本站副本优先 → 公共模板兜底」
   */
  async detail(user: AuthUser, siteId: string, key: string, options: { template?: boolean } = {}) {
    const block = options.template ? await this.resolveTemplate(user, key) : await this.resolveBlock(user, siteId, key)
    return {
      ...block,
      declaration: block.declaration,
      versions: await this.prisma.blockDefinitionVersion.findMany({
        where: { blockId: block.id },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, codeHash: true, createdAt: true, createdBy: true }
      })
    }
  }

  /**
   * 把公共模板引入本站（显式复制，幂等）
   * 自动复制已覆盖「保存草稿 / 保存代码」等路径，这里供块库页的「引入本站」按钮使用。
   */
  async apply(user: AuthUser, siteId: string, key: string) {
    const id = siteId
    assertSiteAccess(user, id)
    if (id === PUBLIC_BLOCK_SITE_ID) throw new BadRequestException('公共模板不能引入自身')

    const result = await copyTemplatesToSite(this.prisma, id, [key])
    if (!result.copied) {
      const template = await this.prisma.blockDefinition.findUnique({
        where: { key_siteId: { key, siteId: PUBLIC_BLOCK_SITE_ID } }
      })
      if (!template) throw new NotFoundException(`公共模板不存在：${key}`)
    }
    const block = await this.prisma.blockDefinition.findUnique({ where: { key_siteId: { key, siteId: id } } })
    return { key, siteId: id, id: block?.id ?? null, copied: result.copied }
  }

  /**
   * 把本站引用到的公共模板批量复制为站点自有块（内容编辑器 / 建站导入 / 发布前兜底调用）
   * 站点已引用该块后，其代码改动只影响本站（09 §4.5）
   */
  async copyTemplates(siteId: string, keys: Iterable<string>): Promise<CopyTemplatesResult> {
    return copyTemplatesToSite(this.prisma, siteId, keys)
  }

  /** 使用位置：哪些页面引用了该块 */
  async usages(user: AuthUser, siteId: string, key: string) {
    const block = await this.resolveBlock(user, siteId, key)
    const pages = await this.prisma.page.findMany({
      where: { siteId: block.siteId === PUBLIC_BLOCK_SITE_ID ? siteId : block.siteId },
      select: { id: true, title: true, path: true, blocks: true, status: true }
    })

    return pages
      .map((page) => {
        const instances = normalizeBlockInstances(page.blocks).filter((item) => item.key === block.key)
        return instances.length
          ? {
              pageId: page.id,
              title: page.title,
              path: page.path,
              status: page.status,
              count: instances.length,
              enabled: instances.filter((item) => item.enabled).length
            }
          : null
      })
      .filter(Boolean)
  }

  // ---------------- 写入 ----------------

  /** 新建块（key 由声明决定） */
  async create(user: AuthUser, dto: { scope: 'public' | 'site'; siteId?: string; code: string }) {
    const siteId = dto.scope === 'public' ? PUBLIC_BLOCK_SITE_ID : dto.siteId!
    /** 模板库（siteId = '0'）与站点块都过同一道站点权限：前者仅平台级可写 */
    assertSiteAccess(user, siteId)

    const result = await compileSfc(dto.code)
    if (!result.ok || !result.declaration) {
      throw new BadRequestException({ message: '块代码编译校验未通过', error: result.error })
    }

    const exists = await this.prisma.blockDefinition.findUnique({
      where: { key_siteId: { key: result.declaration.key, siteId } }
    })
    if (exists) throw new BadRequestException(`块标识已存在：${result.declaration.key}`)

    const codeHash = computeCodeHash(dto.code)
    const block = await this.prisma.blockDefinition.create({
      data: {
        key: result.declaration.key,
        name: result.declaration.name,
        hint: result.declaration.hint || '',
        scope: dto.scope,
        siteId,
        code: dto.code,
        codeHash,
        compileStatus: 'ok',
        compileError: null,
        declaration: toJsonInput(result.declaration),
        version: 1
      }
    })
    await this.prisma.blockDefinitionVersion.create({
      data: {
        blockId: block.id,
        version: 1,
        code: dto.code,
        codeHash,
        declaration: toJsonInput(result.declaration),
        createdBy: user?.id ?? null
      }
    })
    return block
  }

  /**
   * 保存块代码
   * 编译失败 → 400 + { line, column, message }（后台编辑器标红该行）
   * 编译通过 → 抽取声明、version+1、留档上一版
   */
  async save(user: AuthUser, siteId: string, key: string, code: string) {
    /**
     * 站点维度写入：本站还没有该块的副本时先从公共模板复制一份再改。
     * 这正是「公共块只作模板、用过就归本站」的落地点——同一份模板被 A / B 两站使用后，
     * A 站改代码不会波及 B 站（09 §4.5）。
     */
    const id = siteId
    if (id !== PUBLIC_BLOCK_SITE_ID) await copyTemplatesToSite(this.prisma, id, [key])

    const block = await this.resolveBlock(user, id, key, true)

    /**
     * codeHash 短路：同一份代码重复保存（编辑器反复触发自动保存/提交未改动的内容）
     * 直接复用上次编译结果——不重复编译、不空转版本号、不产生重复留档。
     * 编译在 worker 线程执行（compileSfc），主线程事件循环不受 CPU 编译阻塞。
     */
    if (computeCodeHash(code) === block.codeHash && block.compileStatus === 'ok') {
      return block
    }

    const result = await compileSfc(code, blockFileName(block.key))
    if (!result.ok) {
      // 编译校验不通过时也落库错误状态，便于块库列表直接看出「这个块现在是坏的」
      await this.prisma.blockDefinition.update({
        where: { id: block.id },
        data: { compileStatus: 'error', compileError: result.error?.message ?? '编译失败' }
      })
      throw new BadRequestException({
        message: `块代码编译失败：${result.error?.message ?? ''}`,
        compileError: result.error
      })
    }

    const declaration = result.declaration!
    if (declaration.key !== block.key) {
      throw new BadRequestException(
        `块标识不可修改：当前 ${block.key}，声明中为 ${declaration.key}（如需换标识请新建块）`
      )
    }

    const codeHash = computeCodeHash(code)
    const nextVersion = block.version + 1

    /**
     * 归档「被覆盖前」的这一版：版本表必须始终覆盖 [上一版, 当前版本] 两个快照。
     * 只写新版本会导致版本号断层，回退时跳过断层、恢复出更旧的（错误的）内容。
     */
    await this.archiveVersion(block.id, block.version, block.code, block.codeHash, block.declaration, user?.id ?? null)

    const updated = await this.prisma.blockDefinition.update({
      where: { id: block.id },
      data: {
        code,
        codeHash,
        compileStatus: 'ok',
        compileError: null,
        name: declaration.name || block.name,
        hint: declaration.hint ?? block.hint,
        declaration: toJsonInput(declaration),
        version: nextVersion
      }
    })

    await this.archiveVersion(block.id, nextVersion, code, codeHash, declaration, user?.id ?? null)

    // 只保留上一版：删掉比「上一版」更旧的留档
    await this.prisma.blockDefinitionVersion.deleteMany({
      where: { blockId: block.id, version: { lt: nextVersion - 1 } }
    })

    return updated
  }

  /** 回退上一版（只保留一版历史，故取 version < 当前版本 的最大者） */
  async rollback(user: AuthUser, siteId: string, key: string) {
    const id = siteId
    /** 与 save 一致：模板受影响的回退也要落到本站副本上（副本不存在时无历史可回退，直接报错） */
    if (id !== PUBLIC_BLOCK_SITE_ID) await copyTemplatesToSite(this.prisma, id, [key])

    const block = await this.resolveBlock(user, id, key, true)
    const previous = await this.prisma.blockDefinitionVersion.findFirst({
      where: { blockId: block.id, version: { lt: block.version } },
      orderBy: { version: 'desc' }
    })
    if (!previous) throw new BadRequestException('没有可回退的上一版')

    /** 同样先归档当前这一版：回退本身也是一次「覆盖」，回退后仍要能再回退 */
    await this.archiveVersion(block.id, block.version, block.code, block.codeHash, block.declaration, user?.id ?? null)
    const nextVersion = block.version + 1

    const updated = await this.prisma.blockDefinition.update({
      where: { id: block.id },
      data: {
        code: previous.code,
        codeHash: previous.codeHash,
        declaration: previous.declaration as never,
        compileStatus: 'ok',
        compileError: null,
        version: nextVersion
      }
    })

    // 只保留上一版：删掉比「上一版」更旧的留档
    await this.prisma.blockDefinitionVersion.deleteMany({
      where: { blockId: block.id, version: { lt: nextVersion - 1 } }
    })

    return updated
  }

  // ---------------- 内部 ----------------

  /**
   * 归档某一版的块快照（同块同版本唯一，已存在则跳过）
   * 被 `save` 与 `rollback` 共用，保证版本表不出现断层
   */
  private async archiveVersion(
    blockId: string,
    version: number,
    code: string,
    codeHash: string,
    declaration: unknown,
    createdBy: string | null
  ) {
    const exists = await this.prisma.blockDefinitionVersion.findUnique({
      where: { blockId_version: { blockId, version } },
      select: { id: true }
    })
    if (exists) return
    await this.prisma.blockDefinitionVersion.create({
      data: { blockId, version, code, codeHash, declaration: toJsonInput(declaration), createdBy }
    })
  }

  // ---------------- 渲染引擎支撑 ----------------

  /**
   * 块代码指纹表（key → codeHash），用于计算页面内容指纹
   * 本站副本优先；公共模板仅作**兜底**（历史数据 / 尚未走到复制时机的引用不因此漏项）
   */
  async codeHashMap(siteId: string): Promise<Map<string, string>> {
    const blocks = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId }] },
      select: { key: true, codeHash: true, siteId: true }
    })
    const map = new Map<string, string>()
    // 站点副本优先覆盖同名公共模板
    for (const block of blocks.sort(sortPublicFirst)) map.set(block.key, block.codeHash)
    return map
  }

  /**
   * 渲染引擎内部清单：需要落盘为 .blocks/Blk<Pascal>.vue 的全部块代码
   * 本站副本优先 + 公共模板兜底：兜底只为「不因半迁移数据而块缺失」，正常路径下站点都已持有副本
   */
  async rendererManifest(siteId: string) {
    const blocks = await this.prisma.blockDefinition.findMany({
      where: { OR: [{ siteId: PUBLIC_BLOCK_SITE_ID }, { siteId }] },
      select: { key: true, name: true, code: true, codeHash: true, compileStatus: true, siteId: true }
    })

    // 同名时站点副本覆盖公共模板
    const byKey = new Map<string, (typeof blocks)[number]>()
    for (const block of blocks.sort(sortPublicFirst)) byKey.set(block.key, block)

    const items = [...byKey.values()]
      .filter((block) => block.compileStatus === 'ok')
      .map((block) => ({
        key: block.key,
        name: block.name,
        code: block.code,
        codeHash: block.codeHash,
        /** 生成目录中的文件名：Blk + PascalCase(key) */
        fileName: blockFileName(block.key)
      }))

    return {
      siteId,
      /** 清单整体指纹：渲染引擎据此判断是否需要重建 .blocks/ */
      manifestHash: computeCodeHash(items.map((item) => `${item.key}:${item.codeHash}`).join('|')),
      items
    }
  }

  // ---------------- 内部工具 ----------------

  /**
   * 解析块：本站副本优先，其次公共模板（只读兜底，便于「还未引入本站」时也能看字段声明）
   * @param forWrite 写操作：落到公共模板上时必须平台级（改模板会波及「之后新引入」的站点）
   */
  private async resolveBlock(user: AuthUser, siteId: string, key: string, forWrite = false) {
    const id = siteId
    /** siteId = '0'（模板库）只对平台级开放：站点管理员既不能读也不能写模板库 */
    assertSiteAccess(user, id)

    const siteBlock = await this.prisma.blockDefinition.findUnique({ where: { key_siteId: { key, siteId: id } } })
    const block =
      siteBlock ??
      (await this.prisma.blockDefinition.findUnique({ where: { key_siteId: { key, siteId: PUBLIC_BLOCK_SITE_ID } } }))
    if (!block) throw new NotFoundException(`块不存在：${key}`)

    if (block.siteId === PUBLIC_BLOCK_SITE_ID && forWrite && !user.platform) {
      throw new BadRequestException('公共模板代码仅平台级角色可修改')
    }
    return block
  }

  /** 只读公共模板（块模板库）：平台级专属 */
  private async resolveTemplate(user: AuthUser, key: string) {
    assertSiteAccess(user, PUBLIC_BLOCK_SITE_ID)
    const block = await this.prisma.blockDefinition.findUnique({
      where: { key_siteId: { key, siteId: PUBLIC_BLOCK_SITE_ID } }
    })
    if (!block) throw new NotFoundException(`公共模板不存在：${key}`)
    return block
  }
}
