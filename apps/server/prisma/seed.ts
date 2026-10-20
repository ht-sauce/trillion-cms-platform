/**
 * 数据库种子：内置角色、后台菜单、平台管理员、块定义、内置模板
 * 权限模型：用户 →（绑定）角色 →（授权）菜单
 * 执行：pnpm db:seed（幂等，可重复执行）
 *
 * 块定义的写入口径（09 §3.7 / §4.2）：
 *   块源码是仓库里的 .vue 文件（`prisma/blocks/<key>.vue`），
 *   种子**逐文件跑一遍编译校验**再把声明写库——
 *   与后台保存块代码走同一个校验函数，因此仓库里的块出不来「能入库但不能编译」的状态。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { validateBlockSfc } from '../src/modules/blocks/sfc'
import { computeCodeHash } from '../src/common/utils/content-hash'

const prisma = new PrismaClient()

/** 公共块的 siteId 约定值（'0' 表示全站可用；不用 NULL 是因为 MySQL 唯一索引不约束多个 NULL） */
const PUBLIC_BLOCK_SITE_ID = '0'

/** 块源码目录（与 prisma/schema 同级，便于一起做版本管理） */
const BLOCKS_DIR = path.join(__dirname, 'blocks')

/**
 * 菜单种子：**按 path 幂等**写入（menu 表无唯一键，故用 findFirst 判定）
 * 幂等键不能用「上级 + 名称」：调整菜单层级时旧行按新上级找不到，会多出一份重复菜单；
 * path 为空的容器型菜单用「名称」兜底判定。
 * 结构支持最多三级；菜单可见性由角色授权决定
 */
async function upsertMenu(data: { title: string; parentId: string | null; path: string | null; sort: number }) {
  const payload = {
    parentId: data.parentId,
    title: data.title,
    path: data.path,
    sort: data.sort,
    visible: true,
    status: 'active'
  }
  const existing = await prisma.menu.findFirst({
    where: data.path ? { path: data.path } : { path: null, title: data.title }
  })
  if (existing) return prisma.menu.update({ where: { id: existing.id }, data: payload })
  return prisma.menu.create({ data: payload })
}

/** 角色种子：按 code 幂等写入（不覆盖状态，避免把后台停用的角色重置回启用） */
async function upsertRole(data: {
  code: string
  name: string
  description: string
  platform: boolean
  builtin: boolean
  sort: number
}) {
  const { code, ...rest } = data
  return prisma.role.upsert({
    where: { code },
    update: rest,
    create: { code, ...rest, status: 'active' }
  })
}

/**
 * 角色-菜单授权：仅在该角色**尚无任何授权**时写入默认值
 * 这样重复执行种子不会覆盖运营在后台调整过的授权
 */
async function grantMenusIfEmpty(roleId: string, menuIds: string[]) {
  const count = await prisma.roleMenu.count({ where: { roleId } })
  if (count > 0) return
  if (!menuIds.length) return
  await prisma.roleMenu.createMany({ data: menuIds.map((menuId) => ({ roleId, menuId })) })
}

/**
 * 角色-菜单授权：**只补缺失的菜单**（已授权的跳过）
 *
 * 用途：老库的角色早已有授权，「仅空时写」的 `grantMenusIfEmpty` 不会再生效，
 * 于是**新增菜单**（如「内容管理」父菜单、「块模板」）需要在种子里显式补齐，
 * 否则运营/站点管理员的侧栏看不到新入口。只补不删，不覆盖运营在后台调整过的授权。
 */
async function grantMenusIfMissing(roleId: string, menuIds: string[]) {
  if (!menuIds.length) return
  await prisma.roleMenu.createMany({
    data: menuIds.map((menuId) => ({ roleId, menuId })),
    skipDuplicates: true
  })
}

/**
 * 同步内置块定义（09 §3.7）
 *
 * 遍历 `prisma/blocks/*.vue`：文件名即块 key，源码经编译校验后写库。
 * 已存在且代码未变的块跳过；代码变了则 version+1 并留档（与后台保存行为一致）。
 * 校验失败的块会打印错误并**中断种子**——宁可种子失败，也不能让一个坏块悄悄进库。
 */
async function syncBlockDefinitions() {
  if (!fs.existsSync(BLOCKS_DIR)) {
    console.log('块定义：目录不存在，跳过（prisma/blocks/）')
    return { total: 0, created: 0, updated: 0, skipped: 0 }
  }

  const files = fs.readdirSync(BLOCKS_DIR).filter((file) => file.endsWith('.vue'))
  let created = 0
  let updated = 0
  let skipped = 0
  const failures: string[] = []

  for (const file of files) {
    const code = fs.readFileSync(path.join(BLOCKS_DIR, file), 'utf8')
    const result = await validateBlockSfc(code, file)

    if (!result.ok || !result.declaration) {
      failures.push(
        `${file}：${result.error?.message ?? '未知错误'}${result.error ? `（第 ${result.error.line} 行）` : ''}`
      )
      continue
    }

    const declaration = result.declaration
    if (declaration.key !== file.replace(/\.vue$/, '')) {
      failures.push(`${file}：文件名与 defineBlock.key（${declaration.key}）不一致`)
      continue
    }

    const codeHash = computeCodeHash(code)
    const existing = await prisma.blockDefinition.findUnique({
      where: { key_siteId: { key: declaration.key, siteId: PUBLIC_BLOCK_SITE_ID } }
    })

    if (existing) {
      if (existing.codeHash === codeHash) {
        skipped += 1
        continue
      }
      const nextVersion = existing.version + 1
      await prisma.blockDefinition.update({
        where: { id: existing.id },
        data: {
          name: declaration.name,
          hint: declaration.hint || '',
          code,
          codeHash,
          compileStatus: 'ok',
          compileError: null,
          declaration: declaration as never,
          version: nextVersion
        }
      })
      await prisma.blockDefinitionVersion.create({
        data: {
          blockId: existing.id,
          version: nextVersion,
          code,
          codeHash,
          declaration: declaration as never,
          createdBy: null
        }
      })
      await prisma.blockDefinitionVersion.deleteMany({
        where: { blockId: existing.id, version: { lt: nextVersion - 1 } }
      })
      updated += 1
      continue
    }

    const block = await prisma.blockDefinition.create({
      data: {
        key: declaration.key,
        name: declaration.name,
        hint: declaration.hint || '',
        scope: 'public',
        siteId: PUBLIC_BLOCK_SITE_ID,
        code,
        codeHash,
        compileStatus: 'ok',
        compileError: null,
        declaration: declaration as never,
        version: 1
      }
    })
    await prisma.blockDefinitionVersion.create({
      data: {
        blockId: block.id,
        version: 1,
        code,
        codeHash,
        declaration: declaration as never,
        createdBy: null
      }
    })
    created += 1
  }

  if (failures.length) {
    throw new Error(`块定义校验失败：\n  - ${failures.join('\n  - ')}`)
  }

  return { total: files.length, created, updated, skipped }
}

async function main() {
  process.env.TZ = process.env.TZ || 'Asia/Shanghai'

  // ---------- 后台菜单（用户 → 角色 → 菜单 的最后一环） ----------
  const dashboard = await upsertMenu({ title: '总览仪表盘', parentId: null, path: '/', sort: 1 })
  /**
   * 「站点管理」改为目录型菜单（容器，本身不可点击，写法与「内容管理」一致），
   * 站点域的入口全部挂在它下面；子级 sort 留空隙（10/20/30）便于插入新入口。
   * 幂等说明：旧版「站点管理」是 path=/sites 的页面型菜单——目录按「path=null + 名称」判定
   * 会新建一行，而旧行随后被「站点列表」（path 仍是 /sites）原地接管改名，不会产生重复入口。
   */
  const sitesRoot = await upsertMenu({ title: '站点管理', parentId: null, path: null, sort: 2 })
  const sitesList = await upsertMenu({ title: '站点列表', parentId: sitesRoot.id, path: '/sites', sort: 10 })
  const sitesNews = await upsertMenu({ title: '新闻资讯', parentId: sitesRoot.id, path: '/sites/news', sort: 20 })
  const sitesFaqs = await upsertMenu({ title: '高频问答', parentId: sitesRoot.id, path: '/sites/faqs', sort: 30 })
  /** 内容域父菜单（容器，本身不可点击）：让「内容 / 页面」与「块库」等同级并列 */
  const contentRoot = await upsertMenu({ title: '内容管理', parentId: null, path: null, sort: 3 })
  const members = await upsertMenu({ title: '会员管理', parentId: null, path: '/members', sort: 4 })
  const monitor = await upsertMenu({ title: 'GEO 监控', parentId: null, path: '/monitor', sort: 5 })
  const settings = await upsertMenu({ title: '系统设置', parentId: null, path: null, sort: 6 })
  const settingsBasic = await upsertMenu({ title: '运行配置', parentId: settings.id, path: '/settings', sort: 1 })
  const settingsUsers = await upsertMenu({ title: '用户管理', parentId: settings.id, path: '/settings/users', sort: 2 })
  const settingsRoles = await upsertMenu({ title: '角色管理', parentId: settings.id, path: '/settings/roles', sort: 3 })
  const settingsMenus = await upsertMenu({ title: '菜单管理', parentId: settings.id, path: '/settings/menus', sort: 4 })

  /**
   * 「内容管理」下的六个入口（09 §3.7 / §6.1）：页面列表 / 工作台 / 块库 / 块模板 / 导航 / 素材
   * 全部**同级**：页面列表与块库互为兄弟——「内容 / 页面」不再兼作容器，否则它自己的列表点不进去
   * 「块库」= 本站块（站点用过即归本站，改代码只影响本站）；「块模板」= 公共模板库（平台级）
   * 「素材管理」= static_files 的可视化入口（上传 / 列表 / 删除此前只有接口，2026-10-07 补页面）
   */
  const content = await upsertMenu({ title: '内容 / 页面', parentId: contentRoot.id, path: '/content', sort: 1 })
  const editor = await upsertMenu({ title: '内容编辑器', parentId: contentRoot.id, path: '/content/editor', sort: 2 })
  const blocksMenu = await upsertMenu({ title: '块库', parentId: contentRoot.id, path: '/blocks', sort: 3 })
  const blockTemplatesMenu = await upsertMenu({
    title: '块模板',
    parentId: contentRoot.id,
    path: '/blocks/templates',
    sort: 4
  })
  const navigationMenu = await upsertMenu({
    title: '导航管理',
    parentId: contentRoot.id,
    path: '/navigations',
    sort: 5
  })
  const filesMenu = await upsertMenu({ title: '素材管理', parentId: contentRoot.id, path: '/files', sort: 6 })

  const allMenuIds = [
    dashboard.id,
    sitesRoot.id,
    sitesList.id,
    sitesNews.id,
    sitesFaqs.id,
    contentRoot.id,
    members.id,
    monitor.id,
    settings.id,
    settingsBasic.id,
    settingsUsers.id,
    settingsRoles.id,
    settingsMenus.id,
    content.id,
    editor.id,
    blocksMenu.id,
    blockTemplatesMenu.id,
    navigationMenu.id,
    filesMenu.id
  ]
  /** 站点级角色的默认菜单：不含站点管理、系统设置与块模板库（模板库仅平台级）；**父菜单必须授权**，否则子菜单被一并丢弃 */
  const siteMenuIds = [
    dashboard.id,
    contentRoot.id,
    content.id,
    editor.id,
    blocksMenu.id,
    navigationMenu.id,
    filesMenu.id,
    members.id,
    monitor.id
  ]

  // ---------- 内置角色 ----------
  const adminRole = await upsertRole({
    code: 'admin',
    name: '系统管理员',
    description: '平台级：站点、内容、块库、导航、会员、监控与系统设置（用户/角色/菜单）全量权限',
    platform: true,
    builtin: true,
    sort: 1
  })
  const siteAdminRole = await upsertRole({
    code: 'site_admin',
    name: '站点管理员',
    description: '站点级：授权站点的内容编辑器、块库、导航、会员与监控',
    platform: false,
    builtin: true,
    sort: 2
  })

  await grantMenusIfEmpty(adminRole.id, allMenuIds)
  await grantMenusIfEmpty(siteAdminRole.id, siteMenuIds)
  /**
   * 内置角色**按定位补齐**授权（只增不减）：
   * 老库里角色的授权只覆盖「当时已存在的菜单」，后来新增的菜单不会自动补上——
   * 表现为管理员侧栏看不到「内容编辑器 / 块库 / 导航管理」，运营只能去角色管理里手工勾。
   * 这里让两个内置角色回到各自定位的全量集合；只补不删，不影响额外授权的自定义角色。
   */
  await grantMenusIfMissing(adminRole.id, allMenuIds)
  await grantMenusIfMissing(siteAdminRole.id, siteMenuIds)

  // ---------- 平台管理员（绑定「系统管理员」角色） ----------
  const adminUser = await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: { roleId: adminRole.id },
    create: {
      username: 'admin',
      password: await bcrypt.hash('admin123456', 10),
      displayName: '平台管理员',
      roleId: adminRole.id,
      siteIds: []
    }
  })

  // ---------- 内置块定义 ----------
  const blockStats = await syncBlockDefinitions()

  // ---------- 默认模板 ----------
  const templates = [
    { key: 'default', name: '通用模板', slots: ['hero-dark', 'section-head', 'faq-list'] },
    { key: 'home', name: '站点首页模板', slots: ['hero-dark', 'trust-grid', 'faq-list', 'entity-banner'] },
    { key: 'article', name: '资讯文章模板', slots: ['article-body', 'faq-list'] }
  ]
  for (const tpl of templates) {
    await prisma.template.upsert({
      where: { key: tpl.key },
      update: { name: tpl.name, slots: tpl.slots as never },
      create: { key: tpl.key, name: tpl.name, slots: tpl.slots as never, builtin: true }
    })
  }

  console.log(
    `种子数据完成：角色 ${adminRole.code}/${siteAdminRole.code} · 管理员 ${adminUser.username}\n` +
      `块定义：共 ${blockStats.total} 个（新建 ${blockStats.created} · 更新 ${blockStats.updated} · 未变 ${blockStats.skipped}）`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
