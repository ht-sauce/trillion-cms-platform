<script setup lang="ts">
/**
 * 站点内容编辑器工作台（09 §6.2）
 *
 * 布局：顶部工具条 + 左列内容树（可搜索，目录 / 页面 / 页面引用的块 + 发布徽标）+ 右侧预览画布（占满一屏高度）。
 * 「页面 / 块 / 发布」三块操作不再常驻底部，改为抽屉，由预览头部的按钮打开。
 * 数据流要点：
 * 1. 内容树 `GET /content/editor/tree` 提供层级与徽标（徽标由产物清单派生，不在此处计算）
 * 2. 预览走票据：`POST /preview/ticket` → 把返回的 url 塞进 iframe src（票据 30 分钟有效，只能读该页草稿）；
 *    预览态提示由本页显式展示（渲染引擎内部不再插提示条，见 09 §7.5）
 * 3. 页面元信息与整页草稿是两套存储：元信息 `PATCH pages/:id`（线上可见字段），草稿 `PUT pages/:id/draft`（后写覆盖、不构建）
 * 4. 块实例的 data 属于草稿内容，改动后必须「保存草稿」才生效
 * 5. 页面访问地址统一由 shared 的 `buildSiteUrl` 拼装（域名 + 站点前缀 + 物化 path），与预览票据、站点列表预览同源（ADR-031）
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import type {
  BlockDeclaration,
  BlockInstance,
  ContentBadge,
  ContentTreeNode,
  EditorialInfo,
  PageKind
} from '@trillion/shared'
import { buildSiteUrl } from '@trillion/shared'
import {
  blocksApi,
  contentApi,
  editorApi,
  previewApi,
  publishApi,
  sitesApi,
  type BuildTask,
  type GeoCheckResult,
  type SiteItem
} from '~/config/api'
import { TERMS } from '~/config/glossary'
import { BADGE_META, BUILD_STATUS_META } from '~/config/menu'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** 树节点：channel / page 的 id 可能撞号，统一加前缀合成唯一 key；block 节点挂在页面下 */
interface EditorTreeNode {
  key: string
  type: 'channel' | 'page' | 'block'
  /** 原始实体 id（block 节点存所属页面 id） */
  id: string
  name: string
  slug: string
  path: string
  sort: number
  kind?: PageKind
  status?: string
  badge?: ContentBadge
  hasMissingBlock?: boolean
  /** 块节点：块定义是否缺失 */
  missing?: boolean
  /** 块节点：是否启用 */
  enabled?: boolean
  /** 块节点：块实例 ID（内容树的块摘要只给 id/key，data 需从草稿取） */
  blockId?: string
  children?: EditorTreeNode[]
}

/** 把树节点还原成契约类型，供目录 / 页面表单弹窗使用（块节点不弹表单，返回 null） */
function toContentNode(node: EditorTreeNode | null): ContentTreeNode | null {
  if (!node || node.type === 'block') return null
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    slug: node.slug,
    path: node.path,
    sort: node.sort,
    kind: node.kind,
    badge: node.badge,
    hasMissingBlock: node.hasMissingBlock
  }
}

const route = useRoute()

/** loading：行级动作（上下移 / 删除 / 发布）用 keyed；整块保存动作单独一个实例 */
const { isLoading, runKeyed } = useLoading()
const { loading: saving, run: runSave } = useLoading()

// ---------------- 站点与内容树 ----------------

const sites = ref<Pick<SiteItem, 'id' | 'name' | 'slug' | 'domain'>[]>([])
const siteId = ref<string>()
const tree = ref<EditorTreeNode[]>([])
const lastBuiltAt = ref<string | null>(null)
const treeLoading = ref(false)
const artifacts = ref<{ pages: { id: string; status: string; onlineAt: string | null }[] }>({ pages: [] })

/** 最新构建任务：工具条的构建状态标记与按钮锁定看它（06 §1.1），null = 从未构建 */
const buildTask = ref<BuildTask | null>(null)

const selectedKey = ref('')
const selectedNode = ref<EditorTreeNode | null>(null)
/** 目录 key 清单：作为 el-tree 的默认展开项；每次重载自增 treeKey 强制重建，让默认值重新生效 */
const expandedKeys = ref<string[]>([])
const treeKey = ref(0)

/** 树搜索：关键词命中名称 / 路径 / 片段即保留，目录由 el-tree 自动保留命中子节点的祖先 */
const treeRef = ref()
const treeKeyword = ref('')

/** 当前选中的页面节点：选中块节点时回溯其所属页面，目录节点不算页面 */
const currentPageNode = computed<EditorTreeNode | null>(() => {
  const node = selectedNode.value
  if (!node) return null
  if (node.type === 'page') return node
  if (node.type === 'block') return findPageNode(tree.value, node.id)
  return null
})

/** 当前页面 id（块节点归属页面也可回推） */
const currentPageId = computed(() => currentPageNode.value?.id)
const isPage = computed(() => Boolean(currentPageNode.value))

/**
 * 当前页面的访问地址（线上口径）：站点主域名 + 站点前缀 + 物化 path。
 * 与站点列表「预览」、预览票据共用 shared 的 `buildSiteUrl`，避免后台各处各拼一套（ADR-031）
 */
const pageUrl = computed(() => {
  const node = currentPageNode.value
  if (!node) return ''
  const site = sites.value.find((item) => item.id === siteId.value)
  if (!site?.domain) return node.path
  return buildSiteUrl(site.domain, site.slug, node.path)
})

/**
 * 打开块代码页：**新标签页**。
 * 用 `navigateTo` 会离开工作台，返回时页面重新挂载、左树与草稿现场全丢（体验上像换了个新页面）。
 * window.open 不经路由、不会自动带 /geocms/ 基础路径，新标签页地址统一用 router.resolve 取带前缀的 href
 */
function openBlockCode(key: string) {
  if (!siteId.value) return
  window.open(router.resolve(`/blocks/${key}?siteId=${siteId.value}`).href, '_blank', 'noopener,noreferrer')
}

/** 复制访问地址（clipboard API 仅在安全上下文可用，失败时提示手动复制） */
async function copyPageUrl() {
  if (!pageUrl.value) return
  try {
    await navigator.clipboard.writeText(pageUrl.value)
    ElMessage.success('访问地址已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中地址复制')
  }
}

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name, slug: item.slug, domain: item.domain }))
  const fromQuery = String(route.query.siteId || '')
  siteId.value = fromQuery || sites.value[0]?.id
}

/** 内容树：目录递归 + 页面下挂块节点（页面无块时不给 children，避免多出无意义的展开箭头） */
function toTree(nodes: ContentTreeNode[]): EditorTreeNode[] {
  return nodes.map((node) => {
    const key = node.type === 'channel' ? `c-${node.id}` : `p-${node.id}`
    const blockNodes: EditorTreeNode[] = (node.blocks || []).map((block) => ({
      key: `${key}-b-${block.id}`,
      type: 'block',
      id: node.id,
      name: block.name,
      slug: block.key,
      path: block.key,
      sort: 0,
      missing: block.missing,
      enabled: block.enabled,
      blockId: block.id
    }))
    const children =
      node.type === 'channel' ? toTree(node.children || []) : [...toTree(node.children || []), ...blockNodes]
    return {
      key,
      type: node.type,
      id: node.id,
      name: node.name,
      slug: node.slug,
      path: node.path,
      sort: node.sort,
      kind: node.kind,
      status: node.status,
      badge: node.badge,
      hasMissingBlock: node.hasMissingBlock,
      children: children.length ? children : undefined
    }
  })
}

async function loadTree() {
  if (!siteId.value) return
  treeLoading.value = true
  try {
    const result = await editorApi.tree(siteId.value)
    tree.value = toTree(result.nodes)
    lastBuiltAt.value = result.lastBuiltAt
    /** 默认展开全部目录，运营不必逐个点开 */
    expandedKeys.value = channelKeys(tree.value)
    treeKey.value += 1
    /** `:key` 重建会丢掉过滤状态，重建后按当前关键词重新过滤一次 */
    await nextTick()
    if (treeKeyword.value) treeRef.value?.filter(treeKeyword.value)
  } finally {
    treeLoading.value = false
  }
}

function channelKeys(nodes: EditorTreeNode[]): string[] {
  return nodes.flatMap((node) => (node.type === 'channel' ? [node.key, ...channelKeys(node.children || [])] : []))
}

/** 树搜索：名称 / 路径 / 片段任一命中即保留 */
function filterTreeNode(value: string, data: EditorTreeNode): boolean {
  const keyword = value.trim().toLowerCase()
  if (!keyword) return true
  return (
    data.name.toLowerCase().includes(keyword) ||
    data.path.toLowerCase().includes(keyword) ||
    data.slug.toLowerCase().includes(keyword)
  )
}

watch(treeKeyword, (value) => treeRef.value?.filter(value))

async function loadArtifacts() {
  if (!siteId.value) return
  const result = await publishApi.artifacts(siteId.value)
  artifacts.value = { pages: result.pages }
  /** 产物时间无条件更新：构建完成后要能看到新时间，切站点时也不能残留上一个站点的值 */
  lastBuiltAt.value = result.lastBuiltAt
  buildTask.value = result.task
}

// ---------------- 构建状态与按钮锁定（06 §1.1）----------------

/** 当前时刻：驱动「已运行 xx」时长文案（每 3 秒随轮询刷新） */
const nowTs = ref(Date.now())

/** 是否进行中（排队中 / 构建中）：进行中三个构建按钮全部锁定 */
function isBuildBusy(status?: string | null) {
  return status === 'running' || status === 'pending'
}

const buildBusy = computed(() => isBuildBusy(buildTask.value?.status))

/** 构建状态元信息（无任务 = 未构建） */
const buildMeta = computed(() => BUILD_STATUS_META[buildTask.value?.status ?? 'idle'] ?? BUILD_STATUS_META.idle)

/** 状态旁补充：进行中显示已运行时长，结束后显示完成时间 */
const buildAside = computed(() => {
  const task = buildTask.value
  if (!task) return ''
  if (isBuildBusy(task.status)) {
    /** 服务端输出的是北京时间串（`YYYY-MM-DD HH:mm:ss`），转 `/` 分隔后各浏览器都能解析 */
    const started = Date.parse(task.createdAt.replace(/-/g, '/'))
    if (!started) return ''
    const seconds = Math.max(0, Math.round((nowTs.value - started) / 1000))
    return seconds < 60 ? `已运行 ${seconds} 秒` : `已运行 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  }
  return task.finishedAt || ''
})

/** 失败原因：取日志末尾几行并压成一行（弹层里不保留换行，压平后才读得顺） */
function buildFailReason(): string {
  const lines = String(buildTask.value?.log || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-3)
  const text = lines.join(' / ')
  return text.length > 260 ? `…${text.slice(-260)}` : text || '构建失败：可在服务端构建日志中查看详情'
}

let buildPoll: ReturnType<typeof setInterval> | null = null

function stopBuildPoll() {
  if (buildPoll) {
    clearInterval(buildPoll)
    buildPoll = null
  }
}

/**
 * 构建中每 3 秒轮询状态：锁定只看服务端（刷新页面、换人换浏览器同样锁定），不依赖本地请求状态。
 * 「进行中 → 结束」的提示只在这里判定——切站点与首屏加载也会改变状态值，用 watch 判会误报。
 */
function startBuildPoll() {
  if (buildPoll) return
  buildPoll = setInterval(async () => {
    nowTs.value = Date.now()
    const before = buildTask.value
    await loadArtifacts()
    const after = buildTask.value
    if (before && after && before.status !== after.status && !isBuildBusy(after.status)) {
      stopBuildPoll()
      await Promise.all([loadTree(), loadArtifacts()])
      if (after.status === 'success') ElMessage.success('构建完成，线上已更新')
      else if (after.status === 'failed') ElMessage.error(`构建失败：${buildFailReason()}`)
    }
  }, 3000)
}

watch(buildBusy, (busy) => (busy ? startBuildPoll() : stopBuildPoll()))
onUnmounted(stopBuildPoll)

const onRefresh = debounce(
  () =>
    runKeyed('refresh', async () => {
      await Promise.all([loadTree(), loadArtifacts()])
      if (currentPageId.value) await Promise.all([loadDraft(), loadPreview()])
    }),
  DEBOUNCE_WAIT
)

// ---------------- 预览 ----------------

const previewUrl = ref('')
const previewHost = ref<string | null>(null)
/** 票据请求失败（区别于「渲染引擎地址未配置」：后者 host 为 null 但请求是成功的） */
const previewError = ref(false)

async function loadPreview() {
  const pageId = currentPageId.value
  if (!siteId.value || !pageId) {
    previewUrl.value = ''
    return
  }
  try {
    const ticket = await previewApi.ticket(siteId.value, pageId)
    previewUrl.value = ticket.url
    previewHost.value = ticket.host
    previewError.value = false
  } catch {
    previewUrl.value = ''
    previewError.value = true
  }
}

// ---------------- 草稿与元信息 ----------------

interface DraftForm {
  title: string
  slug: string
  kind: PageKind
  summary: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  authorName: string
  editorial: EditorialInfo
  jsonLdMode: 'auto_append' | 'override'
  jsonLd: string
}

function emptyDraftForm(): DraftForm {
  return {
    title: '',
    slug: '',
    kind: 'static',
    summary: '',
    seoTitle: '',
    seoDescription: '',
    seoKeywords: '',
    authorName: '',
    editorial: { writer: '', reviewer: '', source: '', nextReviewDate: '' },
    jsonLdMode: 'auto_append',
    jsonLd: ''
  }
}

const draftForm = reactive<DraftForm>(emptyDraftForm())
const draftUpdatedAt = ref<string | null>(null)
const blocks = ref<BlockInstance[]>([])

/** 操作面板改为抽屉（页面 / 块 / 发布），预览画布因此可以占满一屏高度 */
const pageDrawer = ref(false)
const blockDrawer = ref(false)
const publishDrawer = ref(false)

function openOps(target: 'page' | 'block' | 'publish') {
  if (target === 'page') pageDrawer.value = true
  else if (target === 'block') blockDrawer.value = true
  else publishDrawer.value = true
}

/** 当前页在产物清单里的状态（发布抽屉展示） */
const artifactStatus = computed(() => artifacts.value.pages.find((item) => item.id === currentPageId.value))

/** 待发布页面（内容指纹与产物不一致）：增量发布的目标集合 */
const pendingPageIds = computed(() =>
  artifacts.value.pages.filter((item) => item.status === 'pending').map((item) => item.id)
)

/** 目录候选（页面表单弹窗用） */
const channelOptions = computed(() => {
  const result: { id: string; name: string; path: string }[] = []
  const walk = (nodes: EditorTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'channel') {
        result.push({ id: node.id, name: node.name, path: node.path })
        walk(node.children || [])
      }
    }
  }
  walk(tree.value)
  return result
})

async function loadDraft() {
  const pageId = currentPageId.value
  if (!pageId) return
  const result = await editorApi.draft(pageId)
  const draft = result.draft
  draftUpdatedAt.value = draft?.updatedAt ?? null

  draftForm.title = draft?.title ?? currentPageNode.value?.name ?? ''
  draftForm.slug = draft?.slug ?? currentPageNode.value?.slug ?? ''
  draftForm.kind = draft?.kind ?? currentPageNode.value?.kind ?? 'static'
  draftForm.summary = draft?.summary ?? ''
  draftForm.seoTitle = draft?.seoTitle ?? ''
  draftForm.seoDescription = draft?.seoDescription ?? ''
  draftForm.seoKeywords = draft?.seoKeywords ?? ''
  draftForm.authorName = draft?.authorName ?? ''
  draftForm.editorial = {
    writer: draft?.editorial?.writer ?? '',
    reviewer: draft?.editorial?.reviewer ?? '',
    source: draft?.editorial?.source ?? '',
    nextReviewDate: draft?.editorial?.nextReviewDate ?? ''
  }

  /** 块实例：草稿优先；尚无草稿时用内容树里的块摘要兜底（data 为空对象，等待录入） */
  const draftBlocks: BlockInstance[] = draft?.blocks || []
  blocks.value = draftBlocks.length
    ? draftBlocks
    : (currentPageNode.value?.children || [])
        .filter((item) => item.type === 'block')
        .map((item) => ({ id: item.blockId || item.slug, key: item.slug, enabled: item.enabled ?? true, data: {} }))
}

// ---------------- 块实例编辑 ----------------

const blockFormRef = ref()
const selectedBlockId = ref('')
const declarations = ref<Record<string, BlockDeclaration>>({})

const selectedBlock = computed(() => blocks.value.find((item) => item.id === selectedBlockId.value) || null)
const selectedDeclaration = computed<BlockDeclaration | null>(() =>
  selectedBlock.value ? declarations.value[selectedBlock.value.key] || null : null
)
/** 站内页面候选（块内 link 字段下拉） */
const pageOptions = computed(() => {
  const result: { id: string; title: string; path: string }[] = []
  const walk = (nodes: EditorTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'page') result.push({ id: node.id, title: node.name, path: node.path })
      walk(node.children || [])
    }
  }
  walk(tree.value)
  return result
})

watch(selectedBlock, async (block) => {
  if (!block || !siteId.value || declarations.value[block.key]) return
  try {
    const detail = await blocksApi.detail(block.key, siteId.value)
    declarations.value = { ...declarations.value, [block.key]: detail.declaration }
  } catch {
    /** 块定义缺失（missing）时详情接口会失败，表单区给出提示即可 */
  }
})

/** 批量拉取块定义：块清单要展示名称 / 说明（列宽调整后信息更完整），数据表单也要字段声明 */
async function ensureDeclarations() {
  const sid = siteId.value
  if (!sid) return
  const missing = [...new Set(blocks.value.map((item) => item.key))].filter((key) => key && !declarations.value[key])
  if (!missing.length) return
  const results = await Promise.allSettled(missing.map((key) => blocksApi.detail(key, sid)))
  const next = { ...declarations.value }
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') next[missing[index]] = result.value.declaration
  })
  declarations.value = next
}

watch(blocks, ensureDeclarations)

// ---------------- 动作 ----------------

async function onSelectNode(data: EditorTreeNode) {
  if (data.type === 'channel') {
    /**
     * 目录本身不是可编辑内容：直接打开其下第一个页面，
     * 避免「点了目录右侧整片空白、还要再找一次」的体验（无子页面时才只选中目录）
     */
    const target = firstPageNode(data)
    if (target) {
      await onSelectNode(target)
      return
    }
    selectedKey.value = data.key
    selectedNode.value = data
    previewUrl.value = ''
    blocks.value = []
    selectedBlockId.value = ''
    return
  }
  selectedKey.value = data.key
  selectedNode.value = data
  if (data.type === 'block') {
    /** 块节点要选中「块实例」：实例 id 是块节点上的 blockId，不是块标识（slug 存的是 key） */
    selectedBlockId.value = data.blockId || data.slug
    blockDrawer.value = true
  } else {
    selectedBlockId.value = ''
  }
  await Promise.all([loadDraft(), loadPreview()])
}

/** 保存草稿（防抖在外、loading 在内）：草稿快照 + 块实例一并提交；JSON-LD 属页面级字段走 PATCH */
const onSaveDraft = debounce(
  () =>
    runSave(async () => {
      const pageId = currentPageId.value
      if (!pageId) return

      /** 必填未填：提示但不阻断（草稿允许半成品，发布前才强制） */
      const missing = blockFormRef.value?.collectMissing?.() as string[] | undefined
      if (missing?.length) ElMessage.warning(`以下必填项尚未填写：${missing.join('、')}`)

      await editorApi.saveDraft(pageId, {
        draft: {
          title: draftForm.title,
          slug: draftForm.slug,
          summary: draftForm.summary || null,
          seoTitle: draftForm.seoTitle || null,
          seoDescription: draftForm.seoDescription || null,
          seoKeywords: draftForm.seoKeywords || null,
          authorName: draftForm.authorName || null,
          kind: draftForm.kind,
          blocks: blocks.value,
          editorial: draftForm.editorial.writer || draftForm.editorial.reviewer ? draftForm.editorial : null
        },
        blocks: blocks.value
      })
      await editorApi.updatePage(pageId, { jsonLd: draftForm.jsonLd, jsonLdMode: draftForm.jsonLdMode })
      ElMessage.success('草稿已保存')
      await loadDraft()
      await loadPreview()
    }),
  DEBOUNCE_WAIT
)

const onPublish = debounce(
  () =>
    runKeyed(`publish:${currentPageId.value}`, async () => {
      const pageId = currentPageId.value
      if (!siteId.value || !pageId) return
      await publishApi.publishPage(siteId.value, [pageId])
      ElMessage.success('已提交发布')
      await Promise.all([loadTree(), loadArtifacts()])
    }),
  DEBOUNCE_WAIT
)

/**
 * 增量发布：把本站所有「待发布」（内容指纹与产物不一致）的页面一次性提交发布。
 * 服务端只重建目标页 + 站点首页 + 索引（sitemap / llms.txt），不重建整站（09 §8.3 级联规则），
 * 适合日常改完若干页内容后快速上线。
 */
const onIncrementalPublish = debounce(
  () =>
    runKeyed('publish:incremental', async () => {
      const pageIds = pendingPageIds.value
      if (!siteId.value) return
      if (!pageIds.length) {
        ElMessage.info('当前没有待发布的页面')
        return
      }
      try {
        await ElMessageBox.confirm(
          `本次将发布 ${pageIds.length} 个有改动的页面（未改动的页面不重建），确认继续？`,
          '增量发布确认',
          { type: 'warning' }
        )
      } catch {
        return
      }
      await publishApi.publishPage(siteId.value, pageIds)
      ElMessage.success(`已提交 ${pageIds.length} 个页面的增量发布`)
      await Promise.all([loadTree(), loadArtifacts()])
    }),
  DEBOUNCE_WAIT
)

/**
 * 整站重建：该站点全部页面重新渲染并重建索引（增量发布只覆盖有改动的页面，
 * 结构升级 / 产物缺失 / 索引异常时需要整站重来），接口与任务链路已就绪但此前无入口
 */
const onRebuildSite = debounce(
  () =>
    runKeyed('publish:site', async () => {
      if (!siteId.value) return
      try {
        await ElMessageBox.confirm(
          '整站重建将重新渲染该站点的全部页面并重建索引，耗时较长，确认继续？',
          '整站重建确认',
          { type: 'warning' }
        )
      } catch {
        return
      }
      await publishApi.rebuildSite(siteId.value)
      ElMessage.success('已提交整站重建')
      await Promise.all([loadTree(), loadArtifacts()])
    }),
  DEBOUNCE_WAIT
)

/** GEO 索引更新：只重生成 robots / sitemap / llms.txt 与清单路由，不重建页面 */
const onRepair = debounce(
  () =>
    runKeyed('publish:repair', async () => {
      if (!siteId.value) return
      await publishApi.repair(siteId.value)
      ElMessage.success('GEO 索引已更新')
      await loadArtifacts()
    }),
  DEBOUNCE_WAIT
)

const onRollback = debounce(
  () =>
    runKeyed(`rollback:${currentPageId.value}`, async () => {
      const pageId = currentPageId.value
      if (!siteId.value || !pageId) return
      try {
        await ElMessageBox.confirm('回退后线上将回到上一版产物（数据库内容不变），确认继续？', '回退确认', {
          type: 'warning'
        })
      } catch {
        return
      }
      await publishApi.rollback(siteId.value, pageId)
      ElMessage.success('已回退上一版')
      await Promise.all([loadTree(), loadArtifacts()])
    }),
  DEBOUNCE_WAIT
)

const geoCheck = ref<GeoCheckResult | null>(null)
const onGeoCheck = debounce(
  () =>
    runKeyed(`geo:${currentPageId.value}`, async () => {
      const pageId = currentPageId.value
      if (!pageId) return
      geoCheck.value = await contentApi.geoCheck(pageId)
    }),
  DEBOUNCE_WAIT
)

// ---------------- 弹窗 ----------------

const channelDialog = ref(false)
const channelTarget = ref<EditorTreeNode | null>(null)
const pageDialog = ref(false)
const pageTarget = ref<EditorTreeNode | null>(null)
const geoDialog = ref(false)

function openChannelDialog(node: EditorTreeNode | null) {
  channelTarget.value = node
  channelDialog.value = true
}

function openPageDialog(node: EditorTreeNode | null) {
  pageTarget.value = node
  pageDialog.value = true
}

/** 新建页面的默认目录：选中目录用选中目录，选中页面用其所属目录，都没有则取第一个目录 */
const defaultChannelId = computed(() => {
  if (selectedNode.value?.type === 'channel') return selectedNode.value.id
  const parent = findParentChannel(tree.value, currentPageId.value ?? '')
  return parent ?? channelOptions.value[0]?.id ?? null
})

/** 选中一个块实例 */
function selectBlock(row: BlockInstance) {
  selectedBlockId.value = row.id
}

/** 回填块实例数据（动态表单回写） */
function setBlockData(data: Record<string, unknown>) {
  const block = blocks.value.find((item) => item.id === selectedBlockId.value)
  if (block) block.data = data
}

/** 按 id 回溯页面节点（块节点只存页面 id，取 path / 元信息要回到页面） */
function findPageNode(nodes: EditorTreeNode[], pageId: string): EditorTreeNode | null {
  for (const node of nodes) {
    if (node.type === 'page' && node.id === pageId) return node
    const found = findPageNode(node.children || [], pageId)
    if (found) return found
  }
  return null
}

/** 目录下第一个页面节点（含更深层级）：点目录时直接打开它 */
function firstPageNode(node: EditorTreeNode): EditorTreeNode | null {
  for (const child of node.children || []) {
    if (child.type === 'page') return child
    const deeper = firstPageNode(child)
    if (deeper) return deeper
  }
  return null
}

function findParentChannel(nodes: EditorTreeNode[], pageId: string): string | null {
  for (const node of nodes) {
    if (node.type === 'page' && node.id === pageId) return null
    if (node.type === 'channel') {
      if (node.children?.some((child) => child.type === 'page' && child.id === pageId)) return node.id
      const deeper = findParentChannel(node.children || [], pageId)
      if (deeper) return deeper
    }
  }
  return null
}

const onRemove = debounce(
  (node: EditorTreeNode) =>
    runKeyed(`remove:${node.key}`, async () => {
      const isChannel = node.type === 'channel'
      try {
        await ElMessageBox.confirm(
          `确认删除${isChannel ? '目录' : '页面'}「${node.name}」？` + (isChannel ? '' : '已发布页将转为下线。'),
          '删除确认',
          { type: 'warning' }
        )
      } catch {
        return
      }
      const result = isChannel ? await editorApi.removeChannel(node.id) : await editorApi.removePage(node.id)
      ElMessage.success((result as { message?: string }).message || '已删除')
      selectedNode.value = null
      selectedKey.value = ''
      await loadTree()
    }),
  DEBOUNCE_WAIT
)

const onMove = debounce(
  (node: EditorTreeNode, direction: 'up' | 'down') =>
    runKeyed(`move:${node.key}:${direction}`, async () => {
      if (node.type === 'channel') await editorApi.moveChannel(node.id, direction)
      else await editorApi.movePage(node.id, direction)
      await loadTree()
    }),
  DEBOUNCE_WAIT
)

// ---------------- 初始化 ----------------

watch(siteId, async () => {
  selectedNode.value = null
  selectedKey.value = ''
  previewUrl.value = ''
  blocks.value = []
  /** 先清掉上一个站点的构建状态与轮询，避免把它的进度错标到新站点 */
  stopBuildPoll()
  buildTask.value = null
  await Promise.all([loadTree(), loadArtifacts()])
})

onMounted(async () => {
  await loadSites()
  if (siteId.value) await Promise.all([loadTree(), loadArtifacts()])
})
</script>

<template>
  <div class="editor">
    <div class="bar">
      <span class="panel-title">内容编辑器</span>
      <el-select v-model="siteId" placeholder="选择站点" style="width: 220px">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <span class="build-state">
        <TermHint term="buildStatus" />
        <span :class="buildMeta.className">● {{ buildMeta.label }}</span>
        <span v-if="buildAside" class="mono aside">{{ buildAside }}</span>
        <el-tooltip
          v-if="buildTask?.status === 'failed'"
          :content="buildFailReason()"
          placement="bottom"
          popper-class="text-tooltip"
        >
          <span class="fail-hint">失败原因</span>
        </el-tooltip>
        <span class="product">产物 {{ lastBuiltAt || '暂无' }}</span>
      </span>
      <span class="spacer" />
      <el-button
        size="small"
        type="success"
        :disabled="buildBusy"
        :loading="buildBusy || isLoading('publish:incremental')"
        @click="onIncrementalPublish"
      >
        {{ TERMS.incrementalPublish.label
        }}<span v-if="pendingPageIds.length" class="count">（{{ pendingPageIds.length }}）</span>
        <TermHint term="incrementalPublish" :show-label="false" placement="bottom" />
      </el-button>
      <el-button
        size="small"
        :disabled="buildBusy"
        :loading="buildBusy || isLoading('publish:site')"
        @click="onRebuildSite"
      >
        {{ TERMS.siteRebuild.label }}
        <TermHint term="siteRebuild" :show-label="false" placement="bottom" />
      </el-button>
      <el-button size="small" :disabled="buildBusy" :loading="isLoading('publish:repair')" @click="onRepair">
        {{ TERMS.geoIndexUpdate.label }}
        <TermHint term="geoIndexUpdate" :show-label="false" placement="bottom" />
      </el-button>
      <el-button size="small" :loading="isLoading('refresh')" @click="onRefresh">刷新</el-button>
    </div>

    <div class="body">
      <!-- 左列：内容树（带搜索，目录节点点击即打开其下第一个页面） -->
      <aside class="tree-panel">
        <div class="panel-head">
          <span class="panel-title">内容树</span>
          <span class="spacer" />
          <el-button link size="small" @click="openChannelDialog(null)">新建目录</el-button>
          <el-button link size="small" type="primary" @click="openPageDialog(null)">新建页面</el-button>
        </div>
        <el-input v-model="treeKeyword" class="tree-search" clearable placeholder="搜索目录 / 页面 / 块" />
        <div v-loading="treeLoading" class="tree-scroll">
          <el-tree
            ref="treeRef"
            :key="treeKey"
            :data="tree"
            node-key="key"
            :props="{ label: 'name', children: 'children' }"
            :expand-on-click-node="false"
            :default-expanded-keys="expandedKeys"
            :filter-node-method="filterTreeNode"
            highlight-current
            :current-node-key="selectedKey"
            empty-text="该站点暂无内容"
            @node-click="onSelectNode"
          >
            <template #default="{ data }">
              <span class="node">
                <span class="node-name" :class="{ 'is-missing': data.missing }">{{ data.name }}</span>
                <el-tag v-if="data.type === 'channel'" size="small" type="info" effect="plain">目录</el-tag>
                <el-tag
                  v-else-if="data.type === 'block'"
                  size="small"
                  :type="data.missing ? 'danger' : 'info'"
                  effect="plain"
                >
                  {{ data.missing ? '块缺失' : data.enabled ? '已启用' : '已停用' }}
                </el-tag>
                <el-tag
                  v-else-if="data.badge"
                  size="small"
                  :type="BADGE_META[data.badge]?.type || 'info'"
                  effect="plain"
                >
                  {{ BADGE_META[data.badge]?.label }}
                </el-tag>
                <span v-if="data.hasMissingBlock" class="c-danger warn">含缺失块</span>

                <span class="node-ops">
                  <el-button
                    v-if="data.type !== 'block'"
                    link
                    size="small"
                    :loading="isLoading(`move:${data.key}:up`)"
                    @click.stop="onMove(data, 'up')"
                  >
                    上移
                  </el-button>
                  <el-button
                    v-if="data.type !== 'block'"
                    link
                    size="small"
                    :loading="isLoading(`move:${data.key}:down`)"
                    @click.stop="onMove(data, 'down')"
                  >
                    下移
                  </el-button>
                  <el-button
                    v-if="data.type === 'channel'"
                    link
                    size="small"
                    type="primary"
                    @click.stop="openChannelDialog(data)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-if="data.type !== 'block'"
                    link
                    size="small"
                    type="danger"
                    :loading="isLoading(`remove:${data.key}`)"
                    @click.stop="onRemove(data)"
                  >
                    删除
                  </el-button>
                </span>
              </span>
            </template>
          </el-tree>
        </div>
      </aside>

      <!-- 右列：预览画布（占满一屏高度；页面 / 块 / 发布 操作移入抽屉） -->
      <section class="work">
        <div class="preview">
          <div class="panel-head">
            <span class="panel-title">预览</span>
            <!-- 预览态提示：由后台展示（渲染引擎内部不再插提示条，见 09 §7.5） -->
            <span v-if="previewUrl" class="preview-flag"
              ><span class="dot" /><TermHint term="previewMode" /> · 展示草稿</span
            >
            <span class="spacer" />
            <span v-if="pageUrl" class="path mono">{{ pageUrl }}</span>
            <el-button v-if="pageUrl" link size="small" @click="copyPageUrl">复制地址</el-button>
            <el-button link size="small" :disabled="!isPage" @click="openOps('page')">页面</el-button>
            <el-button link size="small" :disabled="!isPage" @click="openOps('block')">块</el-button>
            <el-button link size="small" type="primary" :disabled="!isPage" @click="openOps('publish')">
              发布<span v-if="pendingPageIds.length" class="count">（{{ pendingPageIds.length }}）</span>
            </el-button>
            <el-button v-if="previewUrl" link size="small" @click="loadPreview">刷新</el-button>
          </div>
          <div class="frame-wrap">
            <iframe v-if="previewUrl" :src="previewUrl" class="frame" />
            <div v-else class="empty">
              <template v-if="!isPage">从左侧内容树选择一个页面开始预览</template>
              <template v-else-if="previewError">预览票据获取失败，请重试</template>
              <template v-else-if="previewHost === null">渲染引擎地址未配置，无法生成预览票据</template>
              <template v-else>预览加载失败，请重试</template>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 操作抽屉（原底部页签）：页面 / 块 / 发布 -->
    <el-drawer v-model="pageDrawer" title="页面" size="640px">
      <div class="ops-scroll">
        <template v-if="isPage">
          <el-form label-width="96px">
            <el-form-item>
              <template #label><TermHint term="pageAddress" /></template>
              <div class="row url-row">
                <span class="mono url-text">{{ pageUrl || '站点未配置主域名，暂无完整地址' }}</span>
                <el-button v-if="pageUrl" link size="small" type="primary" @click="copyPageUrl">复制</el-button>
              </div>
            </el-form-item>
            <div class="grid">
              <el-form-item label="标题">
                <el-input v-model="draftForm.title" maxlength="128" />
              </el-form-item>
              <el-form-item>
                <template #label><TermHint term="urlSlug" /></template>
                <el-input v-model="draftForm.slug" maxlength="128" />
              </el-form-item>
              <el-form-item>
                <template #label><TermHint term="pageKind" /></template>
                <el-select v-model="draftForm.kind" style="width: 140px">
                  <el-option label="静态页" value="static" />
                  <el-option label="列表页" value="list" />
                  <el-option label="详情页" value="detail" />
                </el-select>
              </el-form-item>
              <el-form-item label="作者">
                <el-input v-model="draftForm.authorName" maxlength="64" />
              </el-form-item>
            </div>

            <el-form-item label="摘要">
              <el-input v-model="draftForm.summary" type="textarea" :rows="2" maxlength="512" />
            </el-form-item>
            <div class="grid">
              <el-form-item label="SEO 标题">
                <el-input v-model="draftForm.seoTitle" maxlength="128" />
              </el-form-item>
              <el-form-item label="SEO 关键词">
                <el-input v-model="draftForm.seoKeywords" maxlength="128" />
              </el-form-item>
            </div>
            <el-form-item label="SEO 描述">
              <el-input v-model="draftForm.seoDescription" type="textarea" :rows="2" maxlength="512" />
            </el-form-item>

            <div class="section-title"><TermHint term="editorialInfo" />（医疗类内容发布前置）</div>
            <div class="grid">
              <el-form-item label="撰稿人">
                <el-input v-model="draftForm.editorial.writer" maxlength="64" />
              </el-form-item>
              <el-form-item label="审核医师">
                <el-input v-model="draftForm.editorial.reviewer" maxlength="64" />
              </el-form-item>
              <el-form-item label="来源">
                <el-input v-model="draftForm.editorial.source" maxlength="128" />
              </el-form-item>
              <el-form-item label="复核日期">
                <el-date-picker
                  v-model="draftForm.editorial.nextReviewDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="选择日期"
                  style="width: 160px"
                />
              </el-form-item>
            </div>

            <div class="section-title"><TermHint term="jsonLd" />（双模式）</div>
            <el-form-item label="模式">
              <div class="row">
                <el-select v-model="draftForm.jsonLdMode" style="width: 180px">
                  <el-option label="自动 + 追加" value="auto_append" />
                  <el-option label="全量覆盖" value="override" />
                </el-select>
                <el-button link size="small" type="primary" @click="geoDialog = true">预览实际输出</el-button>
              </div>
            </el-form-item>
            <el-form-item label="自定义内容">
              <el-input v-model="draftForm.jsonLd" type="textarea" :rows="4" class="code-input" spellcheck="false" />
            </el-form-item>
          </el-form>
        </template>
        <div v-else class="empty">请选择或新建一个页面</div>
      </div>

      <template #footer>
        <div class="ops-foot">
          <span v-if="draftUpdatedAt" class="updated mono">草稿更新：{{ draftUpdatedAt }}</span>
          <span class="spacer" />
          <el-button size="small" type="primary" @click="openPageDialog(currentPageNode)">编辑信息</el-button>
          <el-button size="small" type="success" :loading="isLoading(`publish:${currentPageId}`)" @click="onPublish">
            提交发布
          </el-button>
          <el-button size="small" type="primary" :loading="saving" @click="onSaveDraft">保存草稿</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 块：实例清单 + 动态数据表单 -->
    <el-drawer v-model="blockDrawer" title="块" size="760px">
      <div class="ops-scroll">
        <template v-if="isPage">
          <el-table
            :data="blocks"
            border
            size="small"
            style="width: 100%"
            empty-text="该页尚未引用任何块"
            highlight-current-row
            :current-row-key="selectedBlockId"
            row-key="id"
            @row-click="selectBlock"
          >
            <el-table-column min-width="240">
              <template #header><TermHint term="blockKey" /></template>
              <template #default="{ row }">
                <div class="bcell">
                  <span class="bname" :class="{ 'c-danger': !declarations[row.key] }">
                    {{ declarations[row.key]?.name || row.key }}
                  </span>
                  <span class="bkey mono">{{ row.key }}</span>
                  <span v-if="declarations[row.key]?.hint" class="bhint" :title="declarations[row.key].hint">
                    {{ declarations[row.key].hint }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column width="110">
              <template #header><TermHint term="blockInstance" /></template>
              <template #default="{ row }">
                <span class="mono">{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="72">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right" class-name="ops-col">
              <template #default="{ row }">
                <el-button link size="small" type="primary" @click.stop="selectBlock(row)">编辑</el-button>
                <el-button link size="small" @click.stop="openBlockCode(row.key)">编辑代码</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="selectedBlock" class="block-form">
            <div class="section-title">
              {{ selectedDeclaration?.name || selectedBlock.key }}
              <span class="c-mute hint-inline">{{ selectedBlock.key }}</span>
            </div>
            <p v-if="!selectedDeclaration" class="c-danger hint-inline">
              块定义缺失或编译失败，无法渲染字段表单：请先到块库修复该块代码
            </p>
            <BlockDataForm
              v-else-if="selectedDeclaration.fields?.length"
              ref="blockFormRef"
              :model-value="selectedBlock.data"
              :fields="selectedDeclaration.fields"
              :context="{ pages: pageOptions }"
              @update:model-value="setBlockData"
            />
            <p v-else class="c-mute hint-inline">该块未声明字段</p>
          </div>
          <div v-else class="empty">选择上方一个块实例以编辑其数据</div>
        </template>
        <div v-else class="empty">请选择或新建一个页面</div>
      </div>

      <template #footer>
        <div class="ops-foot">
          <span class="spacer" />
          <el-button size="small" type="primary" :loading="saving" @click="onSaveDraft">保存草稿</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 发布：状态 + 发布 / 回退 / GEO 体检 -->
    <el-drawer v-model="publishDrawer" title="发布" size="640px">
      <div class="ops-scroll">
        <template v-if="isPage">
          <div class="status-card">
            <div>
              <span class="c-mute"><TermHint term="publishBadge" />：</span>
              <el-tag size="small" :type="BADGE_META[currentPageNode?.badge || 'draft']?.type || 'info'" effect="plain">
                {{ BADGE_META[currentPageNode?.badge || 'draft']?.label }}
              </el-tag>
            </div>
            <div>
              <span class="c-mute"><TermHint term="artifactManifest" />：</span>
              <span class="mono">{{ artifactStatus?.onlineAt || '暂无' }}</span>
            </div>
            <div>
              <span class="c-mute"><TermHint term="pageAddress" />：</span>
              <span class="mono">{{ pageUrl || '未配置主域名' }}</span>
            </div>
          </div>

          <div class="section-title"><TermHint term="geoCheck" /></div>
          <div v-if="geoCheck" class="geo-result">
            <div>
              <span class="c-mute">评分：</span>
              <span
                class="mono"
                :class="geoCheck.score >= 80 ? 'c-success' : geoCheck.score >= 60 ? 'c-warning' : 'c-danger'"
              >
                {{ geoCheck.score }}
              </span>
            </div>
            <el-table v-if="geoCheck.issues.length" :data="geoCheck.issues" border size="small" style="width: 100%">
              <el-table-column label="级别" width="80">
                <template #default="{ row }">
                  <span :class="row.level === 'error' ? 'c-danger' : 'c-warning'">
                    {{ row.level === 'error' ? '错误' : '警告' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="field" label="字段" width="140" />
              <el-table-column prop="message" label="说明" min-width="220" show-overflow-tooltip />
            </el-table>
            <p v-else class="c-success hint-inline">未发现 GEO 问题</p>
          </div>
          <p v-else class="c-mute hint-inline">点击「GEO 体检」生成结果</p>
        </template>
        <div v-else class="empty">请选择或新建一个页面</div>
      </div>

      <template #footer>
        <div class="ops-foot">
          <span class="spacer" />
          <el-button size="small" :loading="isLoading(`geo:${currentPageId}`)" @click="onGeoCheck">GEO 体检</el-button>
          <el-button size="small" :loading="isLoading(`rollback:${currentPageId}`)" @click="onRollback">
            回退上一版
          </el-button>
          <el-button size="small" type="success" :loading="isLoading(`publish:${currentPageId}`)" @click="onPublish">
            发布
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 弹窗（一律独立组件） -->
    <ChannelFormDialog
      v-if="siteId"
      v-model="channelDialog"
      :channel="toContentNode(channelTarget)"
      :site-id="siteId"
      :parent-id="channelTarget ? null : selectedNode?.type === 'channel' ? selectedNode.id : null"
      @saved="loadTree"
    />
    <PageFormDialog
      v-if="siteId"
      v-model="pageDialog"
      :page="toContentNode(pageTarget)"
      :site-id="siteId"
      :channels="channelOptions"
      :default-channel-id="defaultChannelId"
      @saved="loadTree"
    />
    <GeoPreviewDialog
      v-if="siteId && currentPageId"
      v-model="geoDialog"
      :site-id="siteId"
      target="page-jsonld"
      :page-id="currentPageId"
      :mode="draftForm.jsonLdMode"
      :custom="draftForm.jsonLd"
    />
  </div>
</template>

<style scoped lang="scss">
/** 工作台撑满布局 .content，滚动只发生在树区 / 操作区内部（一屏内操作） */
.editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}

.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;
  flex-shrink: 0;

  /** 构建状态：状态徽标 + 时间/耗时（进行中为「已运行 xx」）+ 失败原因气泡 + 产物时间 */
  .build-state {
    display: flex;
    align-items: center;
    gap: $sp-1;
    font-size: $font-size-xs;
    white-space: nowrap;
  }

  .aside,
  .product {
    color: $c-text-mute;
  }

  .fail-hint {
    color: $c-text-mute;
    text-decoration: underline dotted;
    cursor: help;
  }

  .spacer {
    flex: 1;
  }
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: $sp-1;
}

.tree-panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  background: $c-panel;
  border: 1px solid $c-border;
  border-radius: $radius-lg;
  padding: $sp-1;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: $sp-1;
  flex-shrink: 0;

  .spacer {
    flex: 1;
  }
}

.tree-search {
  flex-shrink: 0;
}

.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.node {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  font-size: $font-size-sm;

  .node-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .is-missing {
    color: $c-danger;
  }

  .warn {
    font-size: $font-size-xs;
  }

  /** 操作按钮悬浮才出现：280px 列宽下常驻会挤掉节点名 */
  .node-ops {
    display: none;
    margin-left: auto;
  }

  &:hover .node-ops {
    display: inline-flex;
    align-items: center;
  }
}

.work {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}

.preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  background: $c-panel;
  border: 1px solid $c-border;
  border-radius: $radius-lg;
  padding: $sp-1;

  /** 访问地址：后台展示的是可直接复制的完整地址，过长时省略 */
  .path {
    max-width: 40%;
    overflow: hidden;
    font-size: $font-size-xs;
    color: $c-text-mute;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/** 预览态标记：预览提示从 iframe 内移到画布头部（09 §7.5） */
.preview-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 0 6px;
  font-size: $font-size-xs;
  color: $c-warning;
  background: $c-elevated;
  border-radius: $radius-sm;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $c-warning;
  }
}

.frame-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid $c-border-soft;
  border-radius: $radius-md;
  overflow: hidden;
}

.frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

/** 抽屉内容：高度由抽屉 body 决定，这里只负责内边距 */
.ops-scroll {
  padding-right: 4px;
}

/** 访问地址行：等宽显示 + 复制按钮 */
.url-row {
  width: 100%;
  min-width: 0;

  .url-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: $c-text-sub;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ops-foot {
  display: flex;
  align-items: center;
  gap: $sp-1;
  padding-top: $sp-1;
  border-top: 1px solid $c-border-soft;

  .updated {
    font-size: $font-size-xs;
    color: $c-text-faint;
  }

  .spacer {
    flex: 1;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 $sp-2;
}

.row {
  display: flex;
  align-items: center;
  gap: $sp-1;
}

.section-title {
  font-size: $font-size-md;
  color: $c-text;
  padding: $sp-1 0 4px;
  border-top: 1px solid $c-border-soft;
  margin-top: $sp-1;
}

.block-form {
  padding-top: $sp-1;
}

/** 块清单首列：名称 + 标识 + 说明三行堆叠（说明过长省略，悬停看全文） */
.bcell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.4;

  .bname {
    color: $c-text;
  }

  .bkey {
    font-size: $font-size-xs;
    color: $c-text-faint;
  }

  .bhint {
    overflow: hidden;
    font-size: $font-size-xs;
    color: $c-text-mute;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.status-card {
  display: flex;
  flex-wrap: wrap;
  gap: $sp-2;
  padding: $sp-1;
  background: $c-elevated;
  border-radius: $radius-md;
  font-size: $font-size-sm;
}

.geo-result {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}

.hint-inline {
  margin: 0;
  font-size: $font-size-xs;
}

.empty {
  padding: $sp-3;
  text-align: center;
  color: $c-text-faint;
  font-size: $font-size-sm;
}

.code-input :deep(textarea) {
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  line-height: 1.6;
}
</style>
