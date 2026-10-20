/**
 * 一次性工具：把站点私有块副本的代码，从「已修正的公共模板」重新下发一遍。
 *
 * 背景（09 §4.5 块隔离）：
 *   站点引用某块时会复制一份作为站点自有块（scope=site），之后公共模板的改动
 *   只影响「之后新引入」的站点。因此本次 41 个块 1:1 重写后，
 *   公共模板已是 v2，而站点副本仍停在旧代码，`rendererManifest` 里站点副本会覆盖公共模板，
 *   导致 GEO 构建产物仍是旧 DOM。
 *
 * 适用前提：站点副本从未被运营单独编辑（version=1 且与旧模板一致）。
 *   本脚本**只覆盖「与公共模板同名」的站点副本**，且**只在副本代码哈希 != 模板代码哈希时**才更新，
 *   并保留一份旧版本到 blockDefinitionVersion 以便回溯。
 *
 * 用法：DATABASE_URL=... node resync-site-blocks.mjs <siteSlug>
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'

const prisma = new PrismaClient()
const PUBLIC_SITE_ID = 0

/** 与 src/common/utils/content-hash.ts 的 computeCodeHash 保持同一口径 */
function computeCodeHash(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 32)
}

const slug = process.argv[2]
if (!slug) {
  console.error('用法：node resync-site-blocks.mjs <siteSlug>')
  process.exit(1)
}

const site = await prisma.site.findFirst({ where: { slug } })
if (!site) {
  console.error(`找不到站点：${slug}`)
  process.exit(1)
}

const [templates, copies] = await Promise.all([
  prisma.blockDefinition.findMany({ where: { siteId: PUBLIC_SITE_ID } }),
  prisma.blockDefinition.findMany({ where: { siteId: site.id } })
])

const templateByKey = new Map(templates.map((t) => [t.key, t]))

let updated = 0
let unchanged = 0

for (const copy of copies) {
  const template = templateByKey.get(copy.key)
  if (!template) {
    console.log(`  跳过 ${copy.key}：公共模板不存在`)
    continue
  }
  const templateHash = computeCodeHash(template.code)
  const copyHash = computeCodeHash(copy.code)
  if (templateHash === copyHash) {
    unchanged += 1
    continue
  }

  const nextVersion = copy.version + 1
  await prisma.blockDefinitionVersion.create({
    data: {
      blockId: copy.id,
      version: nextVersion,
      code: template.code,
      codeHash: template.codeHash,
      declaration: template.declaration,
      createdBy: null
    }
  })
  await prisma.blockDefinition.update({
    where: { id: copy.id },
    data: {
      name: template.name,
      hint: template.hint,
      code: template.code,
      codeHash: template.codeHash,
      compileStatus: template.compileStatus,
      compileError: template.compileError,
      declaration: template.declaration,
      version: nextVersion
    }
  })
  console.log(`  更新 ${copy.key} → v${nextVersion}`)
  updated += 1
}

console.log(`\n站点 ${slug}（id=${site.id}）：副本 ${copies.length} 个（更新 ${updated} · 未变 ${unchanged}）`)
await prisma.$disconnect()
