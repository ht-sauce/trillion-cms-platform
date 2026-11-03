<script setup lang="ts">
/**
 * 成功案例管理：按站点隔离的案例列表 + 关键词/行业筛选 + 新建/编辑/删除
 * 案例以独立数据表为管理源（id 寻址，pageId 仅表示关联发布页面），
 * 保存后由服务端自动派生详情页、重算 /cases 列表卡片并触发站点构建
 * 站点切换与默认站点逻辑与新闻管理（news.vue）一致
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { catalogApi, resolveMediaUrl, sitesApi, type CaseItem, type SiteItem } from '~/config/api'
import { BADGE_META } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { isLoading, run, runKeyed } = useLoading()

const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const list = ref<CaseItem[]>([])
const total = ref(0)
const keyword = ref('')
const industry = ref('')
const industryList = ref<string[]>([])
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

/** 弹窗状态：editing 为 null 表示新建 */
const dialogVisible = ref(false)
const editing = ref<CaseItem | null>(null)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  if (!siteId.value && sites.value.length) siteId.value = sites.value[0].id
}

async function load() {
  if (!siteId.value) return
  await run(async () => {
    const result = await catalogApi.cases({
      siteId: siteId.value,
      keyword: keyword.value || undefined,
      industry: industry.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = result.list
    total.value = result.total
    industryList.value = result.industryList
  })
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: CaseItem) {
  editing.value = row
  dialogVisible.value = true
}

const onRemove = debounce(
  (row: CaseItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除案例「${row.title}」？其详情页会一并删除，该操作不可恢复`, '删除确认', {
          type: 'warning'
        })
      } catch {
        /** 用户取消 */
        return
      }
      await catalogApi.removeCase(row.id)
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
watch(industry, () => {
  page.value = 1
  load()
})
watch(siteId, () => {
  page.value = 1
  industry.value = ''
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
      <span class="panel-title">成功案例</span>
      <el-select v-model="siteId" size="small" placeholder="选择站点" style="width: 180px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索标题"
        style="width: 170px"
        clearable
        @keyup.enter="load"
        @clear="load"
      />
      <el-select v-model="industry" size="small" placeholder="全部行业" clearable style="width: 140px">
        <el-option v-for="item in industryList" :key="item" :label="item" :value="item" />
      </el-select>
      <span class="spacer" />
      <el-button type="primary" size="small" @click="openCreate">新建</el-button>
    </div>

    <el-table v-loading="isLoading()" :data="list" border size="small" style="width: 100%" empty-text="暂无案例">
      <el-table-column label="案例" min-width="220">
        <template #default="{ row }">
          <div class="case-cell">
            <img v-if="row.img" :src="resolveMediaUrl(row.img)" :alt="row.title" class="case-thumb" />
            <span class="case-title">{{ row.title }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="industry" label="行业" width="100" show-overflow-tooltip />
      <el-table-column prop="location" label="地点" width="110" show-overflow-tooltip />
      <el-table-column label="面积 / 年份" width="130">
        <template #default="{ row }">
          <span class="mono">{{ row.area || '-' }}</span>
          <span v-if="row.year" class="c-mute"> / {{ row.year }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="system" label="使用体系" min-width="160" show-overflow-tooltip />
      <el-table-column min-width="190" show-overflow-tooltip>
        <template #header><TermHint term="pageAddress" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="88">
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

    <CaseDialog v-model="dialogVisible" :site-id="siteId" :item="editing" @saved="load" />
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

.case-cell {
  display: flex;
  align-items: center;
  gap: $sp-1;
  min-width: 0;
}

.case-thumb {
  width: 44px;
  height: 30px;
  object-fit: cover;
  border-radius: 2px;
  flex: none;
}

.case-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
