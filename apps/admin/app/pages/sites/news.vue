<script setup lang="ts">
/**
 * 新闻资讯管理：按站点隔离的新闻文章列表 + 关键词筛选 + 新建/编辑/删除
 * 新闻以独立数据表为管理源（id 寻址，pageId 仅表示关联页面），保存后由服务端自动触发站点构建
 * 站点切换与默认站点逻辑与素材管理（files.vue）一致
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { newsFaqApi, sitesApi, type NewsArticleItem, type SiteItem } from '~/config/api'
import { BADGE_META } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { isLoading, run, runKeyed } = useLoading()

const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const list = ref<NewsArticleItem[]>([])
const total = ref(0)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

/** 弹窗状态：editing 为 null 表示新建 */
const dialogVisible = ref(false)
const editing = ref<NewsArticleItem | null>(null)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  if (!siteId.value && sites.value.length) siteId.value = sites.value[0].id
}

async function load() {
  if (!siteId.value) return
  await run(async () => {
    const result = await newsFaqApi.articleList({
      siteId: siteId.value,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = result.list
    total.value = result.total
  })
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: NewsArticleItem) {
  editing.value = row
  dialogVisible.value = true
}

const onRemove = debounce(
  (row: NewsArticleItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除新闻「${row.title}」？该操作不可恢复`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await newsFaqApi.removeArticle(row.id)
      ElMessage.success('已删除，站点正在重新构建')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 发布状态徽标（published / pending / missing / draft，未知值兜底 info） */
function statusMeta(status: string) {
  return BADGE_META[status] ?? { label: status, type: 'info' as const }
}

watch([page, pageSize], load)
watch(siteId, () => {
  page.value = 1
  load()
})
onMounted(async () => {
  await loadSites()
  await load()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">新闻资讯</span>
      <el-select v-model="siteId" size="small" placeholder="选择站点" style="width: 200px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索标题"
        style="width: 180px"
        clearable
        @keyup.enter="load"
        @clear="load"
      />
      <span class="spacer" />
      <el-button type="primary" size="small" @click="openCreate">新建</el-button>
    </div>

    <el-table v-loading="isLoading()" :data="list" border size="small" style="width: 100%" empty-text="暂无新闻">
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column min-width="220" show-overflow-tooltip>
        <template #header><TermHint term="pageAddress" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column label="发布日期" width="110">
        <template #default="{ row }">
          <span class="mono">{{ row.publishDate || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="statusMeta(row.status).type" effect="plain">
            {{ statusMeta(row.status).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="openEdit(row)">编辑</el-button>
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

    <NewsDialog v-model="dialogVisible" :site-id="siteId" :article="editing" @saved="load" />
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

/**
 * 操作列规格（间距、换行、禁止省略号）统一在 `assets/scss/main.scss` 的 `.ops-col` 定义，
 * 页面只负责 `class-name="ops-col"` 与列宽：2 个按钮 × 约 40px + 16px 内边距 ≈ 100px
 */

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
