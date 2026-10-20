<script setup lang="ts">
/**
 * 块库（本站块）：站点使用过的块都归本站所有
 *
 * 块隔离口径（09 §4.5）：
 *   1) 公共块（siteId = 0）只作**模板**，站点首次引用时复制成本站自有块（保存草稿即触发）
 *   2) 之后改本站块代码只影响本站，**不影响其他站点**；模板改了也只影响之后新引入的站点
 *   3) 列表里同一个 key 会出现两行（本站块 + 公共模板），未引入的模板行给出「引入本站」
 *
 * 操作：使用位置（弹窗）、编辑代码（**新标签页**打开，避免返回时丢现场）、引入本站、回退上一版
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { PUBLIC_BLOCK_SITE_ID, blocksApi, sitesApi, type BlockListItem } from '~/config/api'
import { BLOCK_SCOPE_LABEL } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { useAuthStore } from '~/stores/auth'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading：行级动作（引入 / 回退 / 使用位置）用 keyed；防抖由各动作外层的 `debounce` 负责 */
const { isLoading, runKeyed } = useLoading()
/** 平台级角色才可编辑公共模板（模板库对站点级不可见） */
const auth = useAuthStore()

/** window.open 不经路由、不会自动带 /geocms/ 基础路径，新标签页地址统一用 router.resolve 取带前缀的 href */
const router = useRouter()

const sites = ref<{ id: string; name: string }[]>([])
const siteId = ref<string>()
const list = ref<BlockListItem[]>([])
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const keyword = ref('')
/** 归属筛选：本站块 / 公共模板（同一个 key 可能两行并存） */
const scopeFilter = ref<'all' | 'site' | 'template'>('all')
const loading = ref(false)

const createDialog = ref(false)
const usagesDialog = ref(false)
const usagesKey = ref('')
const usagesName = ref('')

const route = useRoute()

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  const fromQuery = String(route.query.siteId || '')
  siteId.value = fromQuery || sites.value[0]?.id
}

/** 本站已持有的块标识：公共模板行据此判断「已引入 / 未引入」 */
const ownedKeys = computed(() => new Set(list.value.filter((item) => item.isSiteScoped).map((item) => item.key)))

/** 块库不做服务端分页（站点块量级在百级），前端按默认 20 条分页展示 */
const filteredList = computed(() => {
  const key = keyword.value.trim()
  return list.value
    .filter((item) => {
      if (scopeFilter.value === 'site' && !item.isSiteScoped) return false
      if (scopeFilter.value === 'template' && item.isSiteScoped) return false
      if (!key) return true
      return item.name.includes(key) || item.key.includes(key) || item.hint.includes(key)
    })
    .sort((a, b) => (a.isSiteScoped === b.isSiteScoped ? a.key.localeCompare(b.key) : a.isSiteScoped ? -1 : 1))
})

const total = computed(() => filteredList.value.length)

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

async function load() {
  if (!siteId.value) return
  loading.value = true
  try {
    list.value = await blocksApi.list(siteId.value)
    page.value = 1
  } finally {
    loading.value = false
  }
}

/** 打开块代码页：**新标签页**打开，返回列表时现场不丢（本站块带 siteId，模板用 0） */
function openCode(row: BlockListItem) {
  const targetSite = row.isSiteScoped ? siteId.value : PUBLIC_BLOCK_SITE_ID
  if (!targetSite) return
  window.open(router.resolve(`/blocks/${row.key}?siteId=${targetSite}`).href, '_blank', 'noopener,noreferrer')
}

const onUsages = debounce(
  (row: BlockListItem) =>
    runKeyed(`usages:${row.id}`, () => {
      usagesKey.value = row.key
      usagesName.value = row.name
      usagesDialog.value = true
    }),
  DEBOUNCE_WAIT
)

/** 引入本站：把公共模板复制成本站自有块（幂等），之后改代码只影响本站 */
const onApply = debounce(
  (row: BlockListItem) =>
    runKeyed(`apply:${row.id}`, async () => {
      if (!siteId.value) return
      await blocksApi.apply(row.key, siteId.value)
      ElMessage.success(`已引入本站：${row.name}（之后的改动只影响本站）`)
      await load()
    }),
  DEBOUNCE_WAIT
)

const onRollback = debounce(
  (row: BlockListItem) =>
    runKeyed(`rollback:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(
          `确认将「${row.name}」回退到上一版？当前版本 v${row.version}，回退后版本仍自增且可继续回退。`,
          '回退确认',
          { type: 'warning' }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await blocksApi.rollback(row.key, siteId.value)
      ElMessage.success('已回退上一版')
      await load()
    }),
  DEBOUNCE_WAIT
)

watch(siteId, load)
onMounted(async () => {
  await loadSites()
  await load()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">块库</span>
      <el-select v-model="siteId" placeholder="选择站点" style="width: 200px">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <el-radio-group v-model="scopeFilter" size="small">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="site">本站块</el-radio-button>
        <el-radio-button value="template">公共模板</el-radio-button>
      </el-radio-group>
      <el-input v-model="keyword" placeholder="搜索块名 / 标识 / 用途" style="width: 220px" @keyup.enter="page = 1" />
      <span class="spacer" />
      <el-button size="small" @click="load">刷新</el-button>
      <el-button type="primary" size="small" @click="createDialog = true">新建块</el-button>
    </div>

    <p class="tip">
      本站块为本站独有：块被本站使用后即复制一份到本站，改代码只影响本站；公共模板只在首次引入时提供初始代码。
    </p>

    <el-table v-loading="loading" :data="pagedList" border size="small" style="width: 100%" empty-text="暂无块">
      <el-table-column prop="name" label="块名" min-width="140" show-overflow-tooltip />
      <el-table-column min-width="140">
        <template #header><TermHint term="blockKey" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="hint" label="用途" min-width="180" show-overflow-tooltip />
      <el-table-column label="字段数" width="80">
        <template #default="{ row }">
          <span class="mono">{{ row.fieldCount }}</span>
        </template>
      </el-table-column>
      <el-table-column width="90">
        <template #header><TermHint term="blockVersion" /></template>
        <template #default="{ row }">
          <span class="mono">v{{ row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column min-width="220">
        <template #header><TermHint term="compileStatus" /></template>
        <template #default="{ row }">
          <template v-if="row.compileStatus === 'ok'">
            <span class="c-success">● 正常</span>
          </template>
          <template v-else>
            <span class="c-danger">● 编译失败：{{ row.compileError || '未知错误' }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column width="160">
        <template #header><TermHint term="blockOwner" /></template>
        <template #default="{ row }">
          <el-tag size="small" :type="row.isSiteScoped ? 'warning' : 'info'" effect="plain">
            {{ BLOCK_SCOPE_LABEL[row.scope] || row.scope }}
          </el-tag>
          <el-tag v-if="!row.isSiteScoped && ownedKeys.has(row.key)" size="small" type="success" effect="plain">
            已引入
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.updatedAt }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" :loading="isLoading(`usages:${row.id}`)" @click="onUsages(row)">
            使用位置
          </el-button>
          <el-button
            v-if="row.isSiteScoped || auth.isPlatformAdmin"
            link
            size="small"
            type="primary"
            @click="openCode(row)"
          >
            编辑代码
          </el-button>
          <el-button
            v-if="!row.isSiteScoped && !ownedKeys.has(row.key)"
            link
            size="small"
            type="success"
            :loading="isLoading(`apply:${row.id}`)"
            @click="onApply(row)"
          >
            引入本站
          </el-button>
          <el-button
            v-if="row.isSiteScoped"
            link
            size="small"
            type="danger"
            :loading="isLoading(`rollback:${row.id}`)"
            @click="onRollback(row)"
          >
            回退上一版
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

    <BlockCreateDialog v-if="siteId" v-model="createDialog" :site-id="siteId" @saved="load" />
    <BlockUsagesDialog
      v-if="siteId"
      v-model="usagesDialog"
      :block-key="usagesKey"
      :block-name="usagesName"
      :site-id="siteId"
    />
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .spacer {
    flex: 1;
  }
}

.tip {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
