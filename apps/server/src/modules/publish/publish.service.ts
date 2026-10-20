/**
 * 发布服务：创建任务 → 串行执行 → 调用 GEO 项目构建脚本 → 记录日志
 *
 * 页面级增量：仅传入变更页面 ID，GEO 项目据此只渲染目标路由，
 * 再用「现有产物副本 + 本次生成结果」合并，避免丢页（ADR-028）。
 *
 * 新增能力（09 §8.4 / §8.5）：
 *   - 回退上一版：从 `.old`（或单页归档 `.history/<pageId>`）拷回该页产物 + 更新清单，
 *     **不回退数据库内容** —— 回退后页面自然进入「待发布」，把决策权交回运营
 *   - GEO 索引更新（接口 `POST /publish/repair`）：只重生成 robots / sitemap / llms / 清单，不重渲染页面
 *   - 站点下载：full（可直接托管）/ html（CDN 回源）两种分包
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaService } from '../../prisma/prisma.service'
import { formatDateTime } from '../../common/utils/datetime'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import { siteIdWhere } from '../../common/utils/site-scope'
import { createZip } from '../../common/utils/zip'
import { ArtifactsService } from './artifacts.service'
import { PublicService } from '../public/public.service'
import { copyTemplatesToSite } from '../blocks/block-copy'
import type { ArtifactManifest } from '@trillion/shared'

/** 发布任务目标 */
export interface PublishTargets {
  pageIds: string[]
  /** 需要一并清理的下线页路径（发布管线按「清单 ∖ 全量路由」自动计算，此处仅留扩展位） */
  removedPaths?: string[]
}

/** 进行中的构建状态：此期间不允许再发起构建（界面按钮同步锁定，见 06 §1.1） */
export const BUILD_BUSY_STATUS = ['pending', 'running'] as const

/** 构建状态（无任务 = 从未构建） */
export type BuildStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed'

/**
 * 最新构建任务摘要（站点列表「构建状态」列与编辑器按钮锁定的唯一数据来源）
 * 时间按项目统一口径格式化为「YYYY-MM-DD HH:mm:ss」，不输出 ISO 串
 */
export interface BuildTaskBrief {
  id: string
  scope: string
  status: Exclude<BuildStatus, 'idle'>
  createdAt: string
  finishedAt: string | null
  log: string | null
}

/**
 * 入队选项
 * allowQueueWhenBusy：系统入口（建站导入 `publish: true`）用——已有任务时排队而不是拒绝，
 * 避免「导入被上一次构建挡下」；手动入口一律保持默认（拒绝），让运营看到「现在不能点」
 */
export interface EnqueueOptions {
  allowQueueWhenBusy?: boolean
}

/** 从页面 blocks / 草稿 blocks 里取出块标识（形态容错，非法项忽略） */
function readBlockKeys(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return []
  return blocks.map((item) => String((item as { key?: string } | null)?.key || '')).filter(Boolean)
}

/** 站点级 GEO 产物文件定义（读取 / 手动替换共用同一份清单） */
const GEO_DOC_FILES = [
  { key: 'robots', file: 'robots.txt', description: '爬虫规则 + AI 爬虫策略说明（搜索引擎 / AI 引擎抓取入口）' },
  { key: 'sitemap', file: 'sitemap.xml', description: '全量已发布页面清单 + lastmod（搜索引擎发现入口）' },
  { key: 'llms', file: 'llms.txt', description: '面向大模型的站点摘要（AI 引擎发现入口，llms 自定义在此合成）' }
] as const

/** 单页产物历史归档目录名（与构建脚本约定一致） */
function historyDirOf(sitesRoot: string, slug: string, pageId: string): string {
  return path.join(sitesRoot, `.${slug}.history`, pageId)
}

/** 旧完整产物目录名 */
function oldDirOf(sitesRoot: string, slug: string): string {
  return path.join(sitesRoot, `.${slug}.old`)
}

@Injectable()
export class PublishService implements OnModuleInit {
  private readonly logger = new Logger('Publish')
  /** 串行锁：同站点同时只允许一个构建任务（内存锁，单实例部署约定见 07 部署说明） */
  private running = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly artifacts: ArtifactsService,
    private readonly publicService: PublicService
  ) {}

  /**
   * 启动恢复：服务重启会把任务悬死——running 的锁在内存里已消失，
   * 但 DB 任务仍停在 running/pending。统一复位为 pending 并逐站点拉起。
   * 构建产物走「tmp + 原子 rename」，中断的构建不会污染线上，重跑是安全的。
   */
  async onModuleInit() {
    try {
      const reset = await this.prisma.publishTask.updateMany({
        where: { status: { in: ['pending', 'running'] } },
        data: { status: 'pending', finishedAt: null }
      })
      if (!reset.count) return

      this.logger.warn(`启动恢复：${reset.count} 个未完成的发布任务已重新排队`)
      const pending = await this.prisma.publishTask.findMany({
        where: { status: 'pending' },
        orderBy: { id: 'asc' },
        select: { id: true, siteId: true }
      })
      /** 逐站点只踢第一个：同站点串行由 run/scheduleNext 链式推进，其余保持排队 */
      const firstBySite = new Map<string, string>()
      for (const item of pending) {
        if (!firstBySite.has(item.siteId)) firstBySite.set(item.siteId, item.id)
      }
      for (const taskId of firstBySite.values()) this.runTask(taskId)
    } catch (error) {
      this.logger.error(`启动恢复失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 创建发布任务并入队（非阻塞） */
  async enqueue(
    user: AuthUser,
    siteId: string,
    scope: 'page' | 'site',
    targets: PublishTargets,
    options: EnqueueOptions = {}
  ) {
    /** 手动入口互斥：站点正在构建 / 已排队时直接拒绝（06 §1.1），界面按钮此时也是锁定的 */
    if (!options.allowQueueWhenBusy) await this.assertIdle(siteId)

    /**
     * 发布前兜底：目标页引用到的块必须已有本站副本（09 §4.5）。
     * 正常路径在「保存草稿 / 建站导入」时已复制，这里覆盖历史数据与旁路写入，
     * 避免上线后才发现某个块只有公共模板、站点之间共享同一份代码。
     */
    await this.ensureSiteBlocks(siteId, scope, targets.pageIds ?? [])

    const task = await this.prisma.publishTask.create({
      data: {
        siteId,
        scope,
        targets: targets as never,
        status: 'pending',
        triggeredBy: user?.id ?? null
      }
    })
    this.runTask(task.id)
    return task
  }

  /** 收集目标页引用到的块标识并补齐本站副本（失败不阻断发布：渲染侧仍有公共模板兜底） */
  private async ensureSiteBlocks(siteId: string, scope: 'page' | 'site', pageIds: string[]) {
    try {
      const pages = await this.prisma.page.findMany({
        where: scope === 'site' ? { siteId } : { siteId, id: { in: pageIds } },
        select: { blocks: true, draft: true }
      })
      const keys = pages.flatMap((page) => [
        ...readBlockKeys(page.blocks),
        ...readBlockKeys((page.draft as { blocks?: unknown } | null)?.blocks)
      ])
      if (keys.length) await copyTemplatesToSite(this.prisma, siteId, keys)
    } catch (error) {
      this.logger.warn(`块副本兜底失败 siteId=${siteId}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 启动一次任务执行，异常在本层兜底：run 内部任何 DB/构建故障都不允许
   * 以 unhandledRejection 形式冒到事件循环（会击穿服务进程）。
   */
  private runTask(taskId: string) {
    this.run(taskId).catch((error) => {
      this.logger.error(
        `任务 ${taskId} 执行链异常：${error instanceof Error ? error.stack || error.message : String(error)}`
      )
    })
  }

  /** 任务列表（时间统一走北京时间格式，前端直接展示） */
  async tasks(user: AuthUser, siteId?: string) {
    const where: Record<string, unknown> = { ...siteIdWhere(user, siteId) }
    const list = await this.prisma.publishTask.findMany({ where, orderBy: { id: 'desc' }, take: 20 })
    return list.map((item) => this.toTaskBrief(item))
  }

  /**
   * 站点最新构建状态（null = 从未构建）
   * 不新增表结构：状态就是 `PublishTask` 最新一条记录（06 §1.1）
   */
  async latestTask(siteId: string): Promise<BuildTaskBrief | null> {
    const task = await this.prisma.publishTask.findFirst({
      where: { siteId },
      orderBy: { id: 'desc' }
    })
    return task ? this.toTaskBrief(task) : null
  }

  /**
   * 批量取「站点 → 最新任务」：站点列表用，避免每行一次查询
   * 站点规模小（列表页 20 行 × 少量站点），一次倒序拉取后在内存里取每站首条即可。
   * 日志只带末尾一段：列表页只用来展示失败原因，完整日志仍看 `GET /publish/tasks`
   */
  async latestTaskBySites(siteIds: string[]): Promise<Map<string, BuildTaskBrief>> {
    if (!siteIds.length) return new Map()
    const tasks = await this.prisma.publishTask.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { id: 'desc' }
    })
    const result = new Map<string, BuildTaskBrief>()
    for (const task of tasks) {
      if (result.has(task.siteId)) continue
      const brief = this.toTaskBrief(task)
      result.set(task.siteId, { ...brief, log: this.tailLog(brief.log) })
    }
    return result
  }

  /** 取日志末尾片段（列表接口不整包传输构建日志） */
  private tailLog(log: string | null, max = 400): string | null {
    if (!log) return null
    const text = log.trim()
    return text.length > max ? `…${text.slice(-max)}` : text
  }

  /**
   * 手动入口互斥：站点正在构建 / 已排队即拒绝（409）
   *
   * 与内存构建锁的分工：本检查是**面向用户的状态**（让按钮不可点、请求被明确拒绝），
   * 内存锁 + `run()` 的状态判定才是**并发安全**的最终保证——即便两处并发透传到这里，
   * 后一个任务也只会排队执行，不会出现两个构建进程同写一个产物目录。
   */
  private async assertIdle(siteId: string) {
    const busy = await this.prisma.publishTask.findFirst({
      where: { siteId, status: { in: [...BUILD_BUSY_STATUS] } },
      orderBy: { id: 'desc' },
      select: { status: true }
    })
    if (!busy) return
    throw new ConflictException(
      busy.status === 'running'
        ? '该站点正在构建中，请等待本次构建结束后再操作'
        : '该站点已有构建任务排队中，请等待完成后再操作'
    )
  }

  /** 任务记录 → 对外摘要（时间按中国时区输出，避免前端拿到 ISO 串） */
  private toTaskBrief(task: {
    id: string
    scope: string
    status: string
    log: string | null
    createdAt: Date
    finishedAt: Date | null
  }): BuildTaskBrief {
    return {
      id: task.id,
      scope: task.scope,
      status: task.status as BuildTaskBrief['status'],
      createdAt: formatDateTime(task.createdAt),
      finishedAt: task.finishedAt ? formatDateTime(task.finishedAt) : null,
      log: task.log
    }
  }

  /**
   * 页面级增量发布
   * 级联规则（09 §8.3）：单页发布 → 该页 + 站点首页 + 站内索引
   * 索引类（sitemap / llms / 全站导览）由构建脚本用全量路由自动重生成，
   * 因此这里只需把「首页」显式并入 targets。
   */
  async publishPage(user: AuthUser, siteId: string, pageIds: string[]) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new NotFoundException('站点不存在')
    if (site.renderMode !== 'ssg') throw new BadRequestException('SSR 模式站点无需发布')

    const ids = (pageIds || []).filter(Boolean)
    if (!ids.length) throw new BadRequestException('请指定要发布的页面')

    const pages = await this.prisma.page.findMany({
      where: { siteId: site.id, id: { in: ids } },
      select: { id: true, status: true, path: true }
    })
    /** 传了不属于本站或不存在的 id 必须显式报错，否则会「看起来发布成功但什么都没发」 */
    const found = new Set(pages.map((page) => page.id))
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length) {
      throw new BadRequestException(`页面不存在或不属于本站：${missing.join(', ')}`)
    }

    const offline = pages.filter((page) => page.status !== 'published')
    if (offline.length) {
      throw new BadRequestException('存在未发布状态的页面，请先提交发布状态后再执行构建')
    }

    /** 首页固定级联：单页发布会让首页的索引数据变化，必须一起重建 */
    const home = await this.prisma.page.findFirst({
      where: { siteId: site.id, path: '/', status: 'published' },
      select: { id: true }
    })
    const targets = [...new Set([...ids, ...(home ? [home.id] : [])])]

    return this.enqueue(user, site.id, 'page', { pageIds: targets })
  }

  /** 整站批量重建（平台级） */
  async rebuild(user: AuthUser, siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new NotFoundException('站点不存在')
    if (site.renderMode !== 'ssg') throw new BadRequestException('SSR 模式站点无需发布')
    return this.enqueue(user, siteId, 'site', { pageIds: [] })
  }

  // ---------------- 产物查询 / 回退 / 修复 / 下载 ----------------

  /** 产物清单与逐页状态（后台发布面板用） */
  async artifactSummary(user: AuthUser, siteId: string) {
    const site = await this.assertSite(siteId)
    const manifest = this.artifacts.readManifest(site.slug)
    const routes = await this.publicService.routes(site.slug)

    /** 清单条目与当前内容指纹比对：不等即「待发布」 */
    const entryById = new Map((manifest?.pages ?? []).map((entry) => [entry.pageId, entry]))
    const states = routes.map((route) => {
      const entry = entryById.get(route.id)
      if (!entry) return { ...route, status: 'missing' as const, onlineAt: null }
      const published = entry.contentHash === route.contentHash
      return {
        ...route,
        status: (published ? 'published' : 'pending') as 'published' | 'pending',
        onlineAt: entry.publishedAt ?? null
      }
    })

    return {
      siteId: site.id,
      slug: site.slug,
      hasArtifacts: this.artifacts.hasArtifacts(site.slug),
      lastBuiltAt: manifest?.generatedAt ?? null,
      buildId: manifest?.buildId ?? null,
      routeCount: manifest?.routes?.length ?? 0,
      /** 最新构建任务：编辑器工具条的构建状态与按钮锁定都看它（06 §1.1） */
      task: await this.latestTask(site.id),
      pages: states
    }
  }

  /**
   * 站点级 GEO 产物内容（09 §8.4，接口 `GET /publish/geo-docs/:siteId`）
   * 读取**已构建产物目录里落盘的文件本身**（robots.txt / sitemap.xml / llms.txt），
   * 与「GEO 生成预览」（纯计算）不同：这里看到的就是线上/产物包里的字节。
   */
  async geoDocuments(user: AuthUser, siteId: string) {
    const site = await this.assertSite(siteId)
    const manifest = this.artifacts.readManifest(site.slug)
    const finalDir = this.artifacts.siteDir(site.slug)

    const documents = GEO_DOC_FILES.map((def) => {
      const absolute = path.join(finalDir, def.file)
      try {
        if (!fs.existsSync(absolute)) {
          return { ...def, exists: false, size: 0, updatedAt: null, content: '' }
        }
        const stat = fs.statSync(absolute)
        return {
          ...def,
          exists: true,
          size: stat.size,
          updatedAt: formatDateTime(stat.mtime),
          content: fs.readFileSync(absolute, 'utf8')
        }
      } catch {
        return { ...def, exists: false, size: 0, updatedAt: null, content: '' }
      }
    })

    return {
      siteId: site.id,
      slug: site.slug,
      hasArtifacts: this.artifacts.hasArtifacts(site.slug),
      /** 最近一次构建时间（产物清单 generatedAt，这三个文件随构建重新生成） */
      generatedAt: manifest?.generatedAt ?? null,
      documents
    }
  }

  /**
   * 手动替换站点 GEO 产物文件（`PUT /publish/geo-docs/:siteId`，非常规兜底，一般用不到）
   *
   * 文件平时由发布 / GEO 索引更新按统一口径自动生成；此处直写仅用于
   * 「自动结果无法满足特殊上线要求」时人工覆盖——下次索引更新 / 整站重建
   * 仍会按自动口径重新生成并覆盖手写内容。与构建互斥，且要求站点已有产物。
   */
  async saveGeoDocument(user: AuthUser, siteId: string, key: string, content: string) {
    const site = await this.assertSite(siteId)
    /** 与构建互斥：构建中直写会写进即将被整体替换的目录 */
    await this.assertIdle(site.id)
    if (!this.artifacts.hasArtifacts(site.slug)) {
      throw new BadRequestException('尚无构建产物，请先执行一次发布')
    }
    const def = GEO_DOC_FILES.find((item) => item.key === key)
    if (!def) throw new BadRequestException(`未知的 GEO 产物文件：${key}`)
    if (typeof content !== 'string') throw new BadRequestException('内容必须为文本')

    fs.writeFileSync(path.join(this.artifacts.siteDir(site.slug), def.file), content, 'utf8')
    this.logger.log(`GEO 产物手动替换：站点 ${site.slug} ${def.file}（${content.length} 字符）`)
    return { file: def.file, updatedAt: formatDateTime(new Date()) }
  }

  /**
   * 回退上一版（09 §8.4）
   *
   * 数据源优先级：单页归档 `.history/<pageId>/` → 上一版完整产物 `.old/`
   * 步骤：拷回该页产物文件 → 更新清单条目 → 回写 publishedHash —— **不动数据库内容**。
   * 因此回退后「页面内容指纹 ≠ 产物指纹」，徽标自动变为「待发布」，
   * 让运营看清「线上已回到旧版，但数据库里还是新版」这一事实。
   */
  async rollback(user: AuthUser, siteId: string, pageId: string) {
    const site = await this.assertSite(siteId)
    const root = this.artifacts.sitesRoot()
    const finalDir = this.artifacts.siteDir(site.slug)

    const manifest = this.artifacts.readManifest(site.slug)
    if (!manifest) throw new BadRequestException('尚无构建产物，无法回退')
    const entry = manifest.pages.find((item) => item.pageId === pageId)
    if (!entry) throw new BadRequestException('产物清单中没有该页面')

    const page = await this.prisma.page.findUnique({ where: { id: pageId } })
    if (!page || page.siteId !== site.id) throw new NotFoundException('页面不存在')

    /** 上一版来源：优先单页归档（本次覆盖前刚归档的那份），否则取上一版完整产物 */
    const historyFile = path.join(historyDirOf(root, site.slug, page.id), entry.file)
    const oldFile = path.join(oldDirOf(root, site.slug), entry.file)
    const source = fs.existsSync(historyFile) ? historyFile : fs.existsSync(oldFile) ? oldFile : null
    if (!source) throw new BadRequestException('未找到该页面的上一版产物，无法回退')

    const destinations = [path.join(finalDir, entry.file)]
    /** 上一版清单里的路径可能不同（URL 不可变，理论上不会；保险起见一并处理） */
    const previous = this.readOldManifestEntry(site.slug, page.id)
    if (previous && previous.file !== entry.file) {
      destinations.push(path.join(finalDir, previous.file))
    }

    for (const dest of destinations) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(source, dest)
    }

    /** 清单回写：该页条目指向上一版的指纹与时间 */
    const targetHash = previous?.contentHash ?? ''
    const targetAt = previous?.publishedAt ?? entry.publishedAt
    const blocks = previous?.blocks ?? entry.blocks

    const updated: ArtifactManifest = {
      ...manifest,
      pages: manifest.pages.map((item) =>
        item.pageId === pageId
          ? ({
              ...item,
              contentHash: targetHash || item.contentHash,
              publishedAt: targetAt,
              blocks,
              /** 标记来源，便于排查「线上为什么又变旧了」 */
              rolledBackAt: previous?.publishedAt ?? null
            } as never)
          : item
      )
    }
    fs.writeFileSync(path.join(finalDir, '_trillion.json'), `${JSON.stringify(updated, null, 2)}\n`)

    /** publishedHash 回写为上一版指纹：徽标随即变为「待发布」 */
    if (targetHash) {
      await this.prisma.page.update({
        where: { id: page.id },
        data: { publishedHash: targetHash }
      })
    }

    this.logger.log(`回退：站点 ${site.slug} 页面 ${pageId} ← ${source}`)
    return { pageId: page.id, path: entry.path, onlineAt: targetAt, source: path.relative(root, source) }
  }

  /**
   * GEO 索引更新（09 §8.4，接口 `POST /publish/repair`，界面旧称「产物修复」）：
   * 只重生成 robots / sitemap / llms / 清单元数据，不重渲染页面
   * 适用场景：站点配置（NAP / 域名 / robots 策略 / llms 自定义）改了，但页面内容没动
   */
  async repair(user: AuthUser, siteId: string) {
    const site = await this.assertSite(siteId)
    /** 与构建互斥：两者都写同一个产物目录，构建中执行会把索引写进即将被替换的目录 */
    await this.assertIdle(site.id)
    const finalDir = this.artifacts.siteDir(site.slug)
    if (!this.artifacts.hasArtifacts(site.slug)) {
      throw new BadRequestException('尚无构建产物，请先执行一次发布')
    }

    const docs = await this.publicService.documents(site.slug)
    fs.writeFileSync(path.join(finalDir, 'robots.txt'), docs.robots)
    fs.writeFileSync(path.join(finalDir, 'sitemap.xml'), docs.sitemap)
    fs.writeFileSync(path.join(finalDir, 'llms.txt'), docs.llms)

    /** 清单只更新「全量路由」与生成时间，不动各页条目（页面确实没重建） */
    const manifest = this.artifacts.readManifest(site.slug)
    if (manifest) {
      const routes = await this.publicService.routes(site.slug)
      manifest.routes = routes.map((route) => route.path)
      fs.writeFileSync(path.join(finalDir, '_trillion.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    }

    this.logger.log(`GEO 索引更新：站点 ${site.slug}（robots / sitemap / llms / 清单路由）`)
    return { slug: site.slug, repairedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) }
  }

  /**
   * 站点下载（09 §8.5）
   * @param mode full=含客户端资源（可直接托管） / html=仅 HTML 与 GEO 产物（CDN 回源）
   */
  async download(user: AuthUser, siteId: string, mode: 'full' | 'html') {
    const site = await this.assertSite(siteId)
    if (!this.artifacts.hasArtifacts(site.slug)) {
      throw new BadRequestException('尚未构建产物，请先发布站点')
    }

    const files = this.artifacts.listFiles(site.slug, { includeClientAssets: mode === 'full' })
    const now = new Date()
    const entries = files.map((file) => ({
      name: file.relative,
      data: fs.readFileSync(file.absolute),
      mtime: now
    }))

    /** 部署说明：避免拿到包的人不知道要去哪配托管 */
    const deployNote = [
      `# ${site.name}（${site.slug}）静态产物`,
      '',
      `打包时间：${now.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}`,
      `打包模式：${mode === 'full' ? 'full（HTML + 客户端资源 + GEO 产物，可直接托管）' : 'html（仅 HTML 与 GEO 产物，需自行部署客户端资源）'}`,
      '',
      '## 部署',
      '',
      '1. 把包内全部文件放到站点根目录（index.html 位于根）',
      '2. robots.txt / sitemap.xml / llms.txt 已生成，无需额外处理',
      mode === 'html'
        ? '3. 注意：本包不含 _nuxt 客户端资源，页面交互与会员岛屿不可用，请自行部署 _nuxt 目录'
        : '3. 若使用 CDN，请确保 _nuxt 目录可访问',
      '4. 必须通过 http:// 访问：双击打开（file://）会导致页面导航与交互全部失效；请按根路径部署，不要放到子路径下',
      '',
      '## nginx 参考配置',
      '',
      '产物为目录式 SSG（`/news` → `news/index.html`），标准静态托管即可访问，无需 rewrite 路由转发：',
      '',
      '```nginx',
      'server {',
      '    listen 80;',
      '    server_name example.com;        # 换成你的域名',
      '    root /var/www/site;             # 解压后的根目录（index.html 在这一层）',
      '',
      '    location / {',
      '        try_files $uri $uri/ =404;  # 目录会自动 301 带斜杠并回落其 index.html',
      '    }',
      '}',
      '```',
      '',
      '> 本文件由平台自动生成，随产物一起打包，可直接删除。'
    ].join('\n')
    entries.push({ name: 'DEPLOY.md', data: Buffer.from(deployNote, 'utf8'), mtime: now })

    this.logger.log(`站点下载：${site.slug}（${mode}）共 ${entries.length} 个文件`)
    return {
      buffer: createZip(entries, now),
      filename: `${site.slug}-${mode}-${now.toISOString().slice(0, 10)}.zip`
    }
  }

  // ---------------- 内部 ----------------

  private async assertSite(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new NotFoundException('站点不存在')
    return site
  }

  /** 读取上一版完整产物清单中的某页条目（回退的数据指纹来源） */
  private readOldManifestEntry(slug: string, pageId: string) {
    const file = path.join(oldDirOf(this.artifacts.sitesRoot(), slug), '_trillion.json')
    try {
      if (!fs.existsSync(file)) return null
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as ArtifactManifest
      return manifest.pages.find((item) => item.pageId === pageId) ?? null
    } catch {
      return null
    }
  }

  /**
   * 执行任务（同站点串行）
   *
   * 健壮性约束：任何异常都必须落进终态（success/failed）并释放锁，
   * 这里是「失败不影响线上」的最后一道闸——构建子进程与渲染的故障
   * 只允许体现为任务失败，不允许变成进程崩溃或任务永久卡在 running。
   */
  private async run(taskId: string) {
    let siteId: string | null = null
    let locked = false
    try {
      const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } })
      if (!task) return
      /** 防重入：只有排队中的任务可执行（重复踢入 / 异常重放都停在这里） */
      if (task.status !== 'pending') {
        this.logger.warn(`任务 ${taskId} 状态为 ${task.status}，跳过执行`)
        return
      }
      siteId = task.siteId
      /** check 与 add 必须相邻（中间无 await），保证同站点互斥判断原子 */
      if (this.running.has(task.siteId)) {
        this.logger.warn(`站点 ${task.siteId} 已有构建任务进行中，任务 ${taskId} 保持排队`)
        return
      }
      this.running.add(task.siteId)
      locked = true
      await this.prisma.publishTask.update({ where: { id: taskId }, data: { status: 'running' } })

      const site = await this.prisma.site.findUnique({ where: { id: task.siteId } })
      if (!site) {
        await this.finish(taskId, 'failed', '站点不存在')
        return
      }

      if (site.renderMode !== 'ssg') {
        await this.finish(taskId, 'success', `站点 ${site.slug} 为 SSR 模式，无需构建，内容即时生效`)
        return
      }

      try {
        const targets = (task.targets || { pageIds: [] }) as unknown as PublishTargets
        const output = await this.execBuild(site.slug, targets.pageIds || [])

        /** 构建成功后同步各页 publishedHash：徽标从「待发布」回到「已发布」 */
        const synced = await this.syncPublishedHashes(site.slug)
        const manifest = this.artifacts.readManifest(site.slug)
        await this.prisma.publishTask.update({
          where: { id: taskId },
          data: {
            buildId: manifest?.buildId ?? null,
            artifact: {
              pageCount: manifest?.pages.length ?? 0,
              routes: manifest?.routes.length ?? 0,
              manifestFile: '_trillion.json',
              syncedPages: synced
            } as never
          }
        })

        await this.finish(taskId, 'success', output)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(`构建失败 taskId=${taskId} ${message}`)
        await this.finish(taskId, 'failed', message)
      }
    } catch (error) {
      /** DB 连不上等场景：日志兜底，再尝试一次落 failed，绝不外抛 */
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`任务 ${taskId} 执行异常：${message}`)
      try {
        await this.finish(taskId, 'failed', `任务执行异常：${message}`)
      } catch (finishError) {
        this.logger.error(`任务 ${taskId} 结果回写失败：${String(finishError)}`)
      }
    } finally {
      if (locked && siteId !== null) {
        this.running.delete(siteId)
        await this.scheduleNext(siteId)
      }
    }
  }

  /** 解锁后拉起同站点最早的一个排队任务，保证 pending 任务不会无人唤醒 */
  private async scheduleNext(siteId: string) {
    try {
      const next = await this.prisma.publishTask.findFirst({
        where: { siteId, status: 'pending' },
        orderBy: { id: 'asc' },
        select: { id: true }
      })
      if (next) this.runTask(next.id)
    } catch (error) {
      this.logger.error(`拉取排队任务失败 siteId=${siteId}：${String(error)}`)
    }
  }

  /**
   * 把产物清单里的指纹回写为 Page.publishedHash
   * 只有清单中记录的页面才回写——未参与本次构建的页面指纹不变，保持「待发布」语义
   * 清单可能残留历史页面 id（站点数据重建后页面换 id）：先按库存活过滤，失联 id 跳过，不阻断发布
   */
  private async syncPublishedHashes(slug: string): Promise<number> {
    const manifest = this.artifacts.readManifest(slug)
    if (!manifest) return 0
    const entries = manifest.pages.filter((entry) => entry.contentHash)
    if (!entries.length) return 0
    const alive = await this.prisma.page.findMany({
      where: { id: { in: entries.map((entry) => entry.pageId) } },
      select: { id: true }
    })
    const aliveIds = new Set(alive.map((page) => page.id))
    let count = 0
    for (const entry of entries) {
      if (!aliveIds.has(entry.pageId)) continue
      await this.prisma.page.update({
        where: { id: entry.pageId },
        data: { publishedHash: entry.contentHash }
      })
      count += 1
    }
    return count
  }

  /** 调用 GEO 项目的构建脚本（node scripts/build-sites.mjs --site <slug> --pages id,id） */
  private execBuild(slug: string, pageIds: string[]): Promise<string> {
    const geoDir = path.resolve(process.cwd(), this.config.get<string>('build.geoProjectDir') || '../geo')
    const script = path.join(geoDir, 'scripts', 'build-sites.mjs')
    const args = ['--site', slug]
    if (pageIds.length) args.push('--pages', pageIds.join(','))

    /**
     * 构建脚本需要 API 基址（拉取待构建路由与 GEO 产物）：
     * 优先用环境变量，缺省时按本服务监听端口派生（端口来自 config/ports.mjs，无端口字面量）
     */
    const apiBase = process.env.NUXT_PUBLIC_API_BASE || `http://127.0.0.1:${this.config.get<number>('port')}/geoserver`

    /**
     * 构建超时保护：构建子进程失控（如 Vite 卡死、渲染服务端口挂起）时
     * 强制终止并把任务判为失败——绝不允许任务永久停在 running。
     * 产物采用 tmp + 原子 rename，中途被杀不影响线上站点。
     */
    const timeoutMs = this.config.get<number>('build.timeoutMs') || 15 * 60 * 1000

    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: geoDir,
        env: { ...process.env, NUXT_PUBLIC_API_BASE: apiBase }
      })
      let log = ''
      let timedOut = false
      child.stdout.on('data', (chunk) => (log += chunk.toString()))
      child.stderr.on('data', (chunk) => (log += chunk.toString()))

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        /** 给优雅退出 5 秒，仍不退则强杀 */
        const force = setTimeout(() => child.kill('SIGKILL'), 5000)
        force.unref?.()
        reject(new Error(`构建超时（${Math.round(timeoutMs / 1000)} 秒），已终止构建进程\n${log}`))
      }, timeoutMs)
      timer.unref?.()

      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) return
        if (code === 0) resolve(log || '构建完成')
        else reject(new Error(`构建脚本退出码 ${code}\n${log}`))
      })
    })
  }

  /** 写入任务结果 */
  private async finish(taskId: string, status: 'success' | 'failed', log: string) {
    await this.prisma.publishTask.update({
      where: { id: taskId },
      data: { status, log: log.slice(0, 8000), finishedAt: new Date() }
    })
  }
}
