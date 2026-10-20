<script setup lang="ts">
/**
 * 站点列表页：密集表格 + 搜索筛选 + 预览/新建/编辑/删除
 * 站点前缀列：站点标识 slug（同时作为 SSG 产物目录名），可点击「编辑」进入编辑页修改
 * 域名映射列：主域名（domain，规范地址）+ 别名域名（domains，多域名映射，见 ADR-022）
 * 预览：新标签页打开「主域名 + 站点前缀」——本地多站点共用 localhost:3002 时靠前缀区分站点
 * 编辑：操作列进入深入编辑页 /sites/[id]
 * 下载：打开 SiteDownloadDialog 选择分包模式（完整包 / 纯静态包）下载产物 zip（09 §8.5）
 * GEO产物：打开 GeoArtifactsDialog 查看 robots.txt / sitemap.xml / llms.txt 内容（09 §8.4）
 */
import { buildSiteUrl } from '@trillion/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sitesApi, type SiteItem } from '~/config/api'
import { BUILD_STATUS_META } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 单独负责 */
const { isLoading, runKeyed } = useLoading()

const list = ref<SiteItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const keyword = ref('')
const statusFilter = ref('')
const loading = ref(false)

/** 下载弹窗：待下载站点与显隐（弹窗内部自管产物状态与分包模式） */
const downloadVisible = ref(false)
const downloadSite = ref<SiteItem | null>(null)

function onDownload(row: SiteItem) {
  downloadSite.value = row
  downloadVisible.value = true
}

/** GEO 产物弹窗：查看 robots.txt / sitemap.xml / llms.txt 内容（09 §8.4） */
const geoDocsVisible = ref(false)
const geoDocsSite = ref<SiteItem | null>(null)

function onGeoDocs(row: SiteItem) {
  geoDocsSite.value = row
  geoDocsVisible.value = true
}

/**
 * 加载列表
 * @param silent 静默刷新（构建中轮询用）：不动表格 loading，避免整表闪烁
 */
async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const result = await sitesApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined
    })
    list.value = result.list
    total.value = result.total
  } finally {
    if (!silent) loading.value = false
    nowTs.value = Date.now()
  }
}

// ---------------- 构建状态（06 §1.1）----------------

/** 当前时刻：驱动「已运行 xx」时长文案（每 4 秒随轮询刷新） */
const nowTs = ref(Date.now())

/** 是否存在进行中的构建（唯一触发轮询的条件） */
const hasBusy = computed(() =>
  list.value.some((item) => item.build?.status === 'running' || item.build?.status === 'pending')
)

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 构建进行中时轮询状态（服务端状态为准，刷新页面/换浏览器同样能看到进度） */
function startPoll() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (!hasBusy.value) {
      stopPoll()
      return
    }
    await load(true)
  }, 4000)
}

watch(hasBusy, (busy) => {
  if (busy) startPoll()
  else nowTs.value = Date.now()
})

onUnmounted(stopPoll)

/** 构建状态元信息（无任务 = 未构建） */
function buildMeta(row: SiteItem) {
  return BUILD_STATUS_META[row.build?.status ?? 'idle'] ?? BUILD_STATUS_META.idle
}

/** 时间列：进行中显示已运行时长，结束后显示完成时间 */
function buildTime(row: SiteItem): string {
  const build = row.build
  if (!build) return ''
  if (build.status === 'running' || build.status === 'pending') {
    /** 服务端输出的是北京时间串（`YYYY-MM-DD HH:mm:ss`），换成 `/` 分隔才能被所有浏览器解析 */
    const started = Date.parse(build.createdAt.replace(/-/g, '/'))
    if (!started) return ''
    const seconds = Math.max(0, Math.round((nowTs.value - started) / 1000))
    const text = seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
    return `已运行 ${text}`
  }
  return build.finishedAt || build.createdAt
}

/** 失败原因：取日志末尾几行并压成一行（弹层内不保留换行，压缩后才读得顺） */
function failReason(row: SiteItem): string {
  const lines = String(row.build?.log || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-3)
  const text = lines.join(' / ')
  return text.length > 260 ? `…${text.slice(-260)}` : text || '构建失败：可在服务端构建日志中查看详情'
}

/**
 * 预览地址：主域名 + 站点前缀（slug）
 * 只调 shared 的 `buildSiteUrl`——回环基址（本地多站点共用 localhost:3002）自动带前缀，
 * 域名基址不带前缀；拼装规则全平台一份，避免后台、预览票据各拼一套（见 ADR-031）
 */
function buildPreviewUrl(row: SiteItem): string {
  return buildSiteUrl(row.domain, row.slug)
}

/** 预览站点：新标签页打开「主域名 + 站点前缀」 */
const onPreview = debounce(
  (row: SiteItem) =>
    runKeyed(`preview:${row.id}`, () => {
      if (!row.domain) {
        ElMessage.warning('该站点未配置访问地址，请先在编辑页填写「主域名」')
        return
      }
      window.open(buildPreviewUrl(row), '_blank', 'noopener,noreferrer')
    }),
  DEBOUNCE_WAIT
)

const onRemove = debounce(
  (row: SiteItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除站点「${row.name}」？该操作不可恢复`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await sitesApi.remove(row.id)
      ElMessage.success('已删除')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 注意包一层箭头函数：直接把 `load` 交给 watch 会把新旧值当成 `silent` 传进去 */
onMounted(() => load())
watch([page, pageSize, statusFilter], () => load())
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">站点管理</span>
      <span class="count">共 {{ total }} 个站点</span>
      <span class="spacer" />
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索站点 / 企业 / 域名"
        style="width: 200px"
        @keyup.enter="load"
      />
      <el-select v-model="statusFilter" size="small" clearable placeholder="全部状态" style="width: 100px">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" size="small" @click="navigateTo('/sites/new')">+ 新建站点</el-button>
    </div>

    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无站点">
      <el-table-column prop="name" label="网站名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="companyName" label="企业名称" min-width="180" show-overflow-tooltip />
      <el-table-column min-width="260">
        <template #header><TermHint term="domainMap" /></template>
        <template #default="{ row }">
          <div class="domain-map">
            <div class="domain-main">
              <el-tag size="small" type="primary" effect="plain">主</el-tag>
              <span class="mono">{{ row.domain || '-' }}</span>
            </div>
            <div v-if="row.domains?.length" class="domain-alias">
              <el-tag v-for="item in row.domains" :key="item" size="small" type="info" effect="plain">
                <span class="mono">{{ item }}</span>
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column width="160">
        <template #header><TermHint term="siteSlug" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.slug || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="ICP 备案号" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.icpNumber || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column width="180">
        <template #header><TermHint term="buildStatus" /></template>
        <template #default="{ row }">
          <div class="build-cell">
            <div class="build-line">
              <span :class="buildMeta(row).className">● {{ buildMeta(row).label }}</span>
              <span v-if="buildTime(row)" class="mono time">{{ buildTime(row) }}</span>
            </div>
            <el-tooltip
              v-if="row.build?.status === 'failed'"
              :content="failReason(row)"
              placement="top"
              popper-class="text-tooltip"
            >
              <span class="reason">失败原因</span>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="row.status === 'active' ? 'c-success' : 'c-warning'">
            {{ row.status === 'active' ? '● 启用' : '● 停用' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button
            link
            size="small"
            :disabled="!row.domain"
            :loading="isLoading(`preview:${row.id}`)"
            @click="onPreview(row)"
          >
            预览
          </el-button>
          <el-button link size="small" type="primary" @click="navigateTo(`/sites/${row.id}`)">编辑</el-button>
          <el-button link size="small" type="primary" @click="navigateTo(`/content/editor?siteId=${row.id}`)">
            编辑内容
          </el-button>
          <el-button link size="small" @click="onDownload(row)">下载</el-button>
          <el-button link size="small" @click="onGeoDocs(row)">GEO产物</el-button>
          <el-button link size="small" type="danger" :loading="isLoading(`remove:${row.id}`)" @click="onRemove(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="PAGE_SIZE_OPTIONS"
        :layout="PAGINATION_LAYOUT"
        small
      />
    </div>

    <SiteDownloadDialog
      v-if="downloadSite"
      v-model="downloadVisible"
      :site-id="downloadSite.id"
      :site-name="downloadSite.name"
    />

    <GeoArtifactsDialog
      v-if="geoDocsSite"
      v-model="geoDocsVisible"
      :site-id="geoDocsSite.id"
      :site-name="geoDocsSite.name"
    />
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .count {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }

  .spacer {
    flex: 1;
  }
}

/**
 * 操作列规格（间距、换行、禁止省略号）统一在 `assets/scss/main.scss` 的 `.ops-col` 定义，
 * 页面只负责 `class-name="ops-col"` 与列宽：
 * 本页 6 个按钮（预览 / 编辑 / 编辑内容 / 下载 / GEO产物 / 删除），单行放不下时按统一规格自动换行，
 * 不出现省略号；列宽仍取 210px 基准，由 `.ops-col` 负责换行；
 */

/** 构建状态：状态文案 + 时间（失败时多一个「失败原因」气泡入口） */
.build-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .build-line {
    display: flex;
    align-items: center;
    gap: $sp-1;
    white-space: nowrap;
  }

  .time {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }

  .reason {
    font-size: $font-size-xs;
    color: $c-text-mute;
    text-decoration: underline dotted;
    cursor: help;
    width: fit-content;
  }
}

.domain-map {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.domain-main {
  display: flex;
  align-items: center;
  gap: 4px;
}

.domain-alias {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
