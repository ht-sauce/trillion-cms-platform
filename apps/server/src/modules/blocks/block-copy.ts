/**
 * 公共模板 → 站点块 的复制（09 §4.5「块隔离」）
 *
 * 定位：公共块是**模板**，不是任何站点的渲染来源。站点一旦引用某个块，就把它复制一份
 * （`scope = site`、`siteId = 站点 id`）作为本站自有块，之后块的代码改动只落在站点副本上，
 * **站点之间互不影响**；公共模板的改动也只影响「之后新引入」的站点。
 *
 * 复用方（复制逻辑只有这一份实现）：
 *   1) 内容编辑器保存草稿（站点首次引用该块）
 *   2) 建站导入器（导入描述里用到的块）
 *   3) 发布前兜底（`PublishService.enqueue`）
 *   4) 块库「引入本站」（`POST /blocks/:key/apply`）
 *   5) 数据回填 / 种子（把历史上直接引用公共块的站点补成站点副本）
 *
 * 幂等：站点已有同名副本则跳过；没有对应模板的 key 直接忽略（由「块缺失」逻辑兜底报错）。
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { toJsonInput } from '../../common/utils/json'
import { PUBLIC_BLOCK_SITE_ID } from './constants'

/** 允许传入普通客户端或事务客户端 */
type Db = Pick<PrismaClient, 'blockDefinition' | 'blockDefinitionVersion'>

export interface CopyTemplatesResult {
  /** 本次新复制的块数 */
  copied: number
  /** 已存在站点副本 / 无对应公共模板的数量 */
  skipped: number
}

/**
 * 把公共模板复制为站点自有块
 * @param siteId 目标站点；0（模板库本身）或空值直接跳过
 * @param keys 站点引用到的块标识（可重复、可含不存在的 key）
 */
export async function copyTemplatesToSite(
  db: Db,
  siteId: string,
  keys: Iterable<string>
): Promise<CopyTemplatesResult> {
  const result: CopyTemplatesResult = { copied: 0, skipped: 0 }
  const id = siteId
  if (!id || id === PUBLIC_BLOCK_SITE_ID) return result

  const unique = [...new Set([...keys].map((key) => String(key || '').trim()).filter(Boolean))]
  if (!unique.length) return result

  const owned = await db.blockDefinition.findMany({ where: { siteId: id, key: { in: unique } }, select: { key: true } })
  const ownedKeys = new Set(owned.map((item) => item.key))
  const missing = unique.filter((key) => !ownedKeys.has(key))
  result.skipped += unique.length - missing.length
  if (!missing.length) return result

  const templates = await db.blockDefinition.findMany({ where: { siteId: PUBLIC_BLOCK_SITE_ID, key: { in: missing } } })

  for (const template of templates) {
    const declaration = toJsonInput(template.declaration)
    const block = await db.blockDefinition.create({
      data: {
        key: template.key,
        name: template.name,
        hint: template.hint,
        scope: 'site',
        siteId: id,
        code: template.code,
        codeHash: template.codeHash,
        /** 编译状态如实拷贝：模板是坏的，副本就是坏的（同一份代码），不粉饰也不隐藏 */
        compileStatus: template.compileStatus,
        compileError: template.compileError,
        declaration,
        version: 1
      } satisfies Prisma.BlockDefinitionUncheckedCreateInput
    })
    await db.blockDefinitionVersion.create({
      data: {
        blockId: block.id,
        version: 1,
        code: template.code,
        codeHash: template.codeHash,
        declaration,
        createdBy: null
      }
    })
    result.copied += 1
  }

  result.skipped += missing.length - templates.length
  return result
}
