/**
 * 一次性维护脚本：落实 2026-10-14 仁爱站点页面调整需求（9 项）。
 *
 * 改动均走「块实例 enabled=false 禁用」而非删除，后台可随时恢复：
 *   1. /services（专病门诊）：去掉「出诊白癜风门诊的医师」区块（section-head + doctor-card）；
 *      section-head「就诊 NAP · 全站同一套」标题改为「就诊」
 *   2. /clinic（专病门诊总览）：去掉「出诊 医师」区块（section-head + article-body）
 *   3. /contact（导航「就诊指南」指向页）：去掉 entity-banner（「主体唯一」深色条）
 *   4. /news/<slug> 详情页（7 页）：禁用 hero-dark 大横幅（页骨架自动兜底渲染 H1）
 *   5. /faq/<slug> 详情页（102 页）：同上
 *   6. 页脚导航：footer-1 改「快速导航」（机构资质/医师团队/专业术语通俗解释/就诊指南/高频问答，
 *      pageId 与头部导航一致）；删除 footer-2（就诊服务）分组
 *
 * 用法：DATABASE_URL=... node apply-renai-page-edits.mjs
 * 幂等性：禁用操作重复执行安全；footer-1 项为「先清后建」，重复执行结果一致。
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** 找到页面 blocks 里满足条件的块实例下标 */
function findIndex(blocks, pred, from = 0) {
  for (let i = from; i < blocks.length; i += 1) if (pred(blocks[i])) return i
  return -1
}

/** 禁用页面 blocks 里匹配的第一个块（updatedAt 由 Prisma 自动维护） */
async function disableBlock(pageId, pred, label) {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { path: true, blocks: true } })
  const blocks = page.blocks || []
  const idx = findIndex(blocks, pred)
  if (idx === -1) {
    console.log(`  · ${page.path}：未找到${label}（可能已处理）`)
    return false
  }
  if (blocks[idx].enabled === false) {
    console.log(`  · ${page.path}：${label} 已是禁用状态`)
    return false
  }
  blocks[idx] = { ...blocks[idx], enabled: false }
  await prisma.page.update({ where: { id: pageId }, data: { blocks } })
  console.log(`  ✓ ${page.path}：已禁用${label}`)
  return true
}

try {
  const site = await prisma.site.findFirst({ where: { slug: 'xian-renai-skin' } })
  if (!site) throw new Error('找不到站点 xian-renai-skin')
  const pages = await prisma.page.findMany({
    where: { siteId: site.id },
    select: { id: true, path: true, blocks: true }
  })
  const byPath = (path) => pages.find((pg) => pg.path === path)

  // ── 1. /services：去掉出诊医师区块；NAP 标题改「就诊」 ─────────────────
  console.log('[1] /services 出诊医师区块 + NAP 标题')
  {
    const pg = byPath('/services')
    const blocks = pg.blocks || []
    const headIdx = findIndex(blocks, (b) => b.key === 'section-head' && /出诊.*门诊的医师/.test(b.data?.title || ''))
    if (headIdx !== -1 && blocks[headIdx].enabled !== false) {
      blocks[headIdx] = { ...blocks[headIdx], enabled: false }
      // 紧随其后的 doctor-card 一并禁用
      const cardIdx = findIndex(blocks, (b) => b.key === 'doctor-card', headIdx + 1)
      if (cardIdx === headIdx + 1 && blocks[cardIdx].enabled !== false) {
        blocks[cardIdx] = { ...blocks[cardIdx], enabled: false }
      }
      await prisma.page.update({ where: { id: pg.id }, data: { blocks } })
      console.log('  ✓ /services：已禁用 出诊医师 section-head + doctor-card')
    } else {
      console.log('  · /services：出诊医师区块已处理')
    }
    // NAP 标题
    const page2 = await prisma.page.findUnique({ where: { id: pg.id }, select: { blocks: true } })
    let changed = false
    for (const b of page2.blocks || []) {
      if (b.key === 'section-head' && b.data?.title === '就诊 NAP · 全站同一套') {
        b.data = { ...b.data, title: '就诊' }
        changed = true
      }
    }
    if (changed) {
      await prisma.page.update({ where: { id: pg.id }, data: { blocks: page2.blocks } })
      console.log('  ✓ /services：「就诊 NAP · 全站同一套」→「就诊」')
    }
  }

  // ── 2. /clinic：去掉「出诊 医师」区块 ─────────────────────────────────
  console.log('[2] /clinic 出诊医师区块')
  {
    const pg = byPath('/clinic')
    const blocks = pg.blocks || []
    const headIdx = findIndex(blocks, (b) => b.key === 'section-head' && /出诊\s*医师/.test(b.data?.title || ''))
    if (headIdx !== -1 && blocks[headIdx].enabled !== false) {
      blocks[headIdx] = { ...blocks[headIdx], enabled: false }
      const bodyIdx = findIndex(blocks, (b) => b.key === 'article-body', headIdx + 1)
      if (bodyIdx === headIdx + 1 && blocks[bodyIdx].enabled !== false) {
        blocks[bodyIdx] = { ...blocks[bodyIdx], enabled: false }
      }
      await prisma.page.update({ where: { id: pg.id }, data: { blocks } })
      console.log('  ✓ /clinic：已禁用 出诊医师 section-head + article-body')
    } else {
      console.log('  · /clinic：出诊医师区块已处理')
    }
  }

  // ── 3. /contact：去掉 entity-banner（主体唯一深色条） ──────────────────
  console.log('[3] /contact entity-banner')
  await disableBlock(byPath('/contact').id, (b) => b.key === 'entity-banner', 'entity-banner')

  // ── 4/5. news / faq 详情页：禁用 hero-dark 大横幅 ─────────────────────
  console.log('[4/5] news / faq 详情页 hero-dark')
  for (const pg of pages) {
    const isNews = /^\/news\/[^/]+$/.test(pg.path)
    const isFaq = /^\/faq\/[^/]+$/.test(pg.path) && pg.path !== '/faq/index'
    if (!isNews && !isFaq) continue
    await disableBlock(pg.id, (b) => b.key === 'hero-dark', 'hero-dark 大横幅')
  }

  // ── 6. 页脚导航：footer-1 → 快速导航；footer-2 删除 ────────────────────
  console.log('[6] 页脚导航')
  const footer1 = await prisma.navigation.findFirst({
    where: { siteId: site.id, key: 'footer-1' },
    include: { items: true }
  })
  if (footer1) {
    // 目标项：label → pageId（与头部导航同一页面）
    const targets = [
      { label: '机构资质', path: '/qualifications' },
      { label: '医师团队', path: '/doctors' },
      { label: '专业术语通俗解释', path: '/terms' },
      { label: '就诊指南', path: '/contact' },
      { label: '高频问答', path: '/faq' }
    ]
    const pageIds = []
    for (const t of targets) {
      const pg = await prisma.page.findFirst({ where: { siteId: site.id, path: t.path }, select: { id: true } })
      if (!pg) throw new Error(`找不到页面 ${t.path}`)
      pageIds.push({ label: t.label, pageId: pg.id })
    }
    await prisma.navigationItem.deleteMany({ where: { navigationId: footer1.id } })
    await prisma.navigationItem.createMany({
      data: pageIds.map((it, i) => ({ navigationId: footer1.id, label: it.label, pageId: it.pageId, sort: i }))
    })
    if (footer1.title !== '快速导航') {
      await prisma.navigation.update({ where: { id: footer1.id }, data: { title: '快速导航' } })
    }
    console.log('  ✓ footer-1 → 快速导航（5 项，pageId 与头部导航一致）')
  }
  const footer2 = await prisma.navigation.findFirst({ where: { siteId: site.id, key: 'footer-2' } })
  if (footer2) {
    await prisma.navigation.delete({ where: { id: footer2.id } }) // 级联清理 items
    console.log('  ✓ footer-2（就诊服务）分组已删除')
  } else {
    console.log('  · footer-2 已删除')
  }

  console.log('完成。请重建站点产物：node scripts/exec.mjs geo build:site --site xian-renai-skin --rebuild')
} finally {
  await prisma.$disconnect()
}
