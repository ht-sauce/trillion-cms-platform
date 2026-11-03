<script setup lang="ts">
/**
 * 产品管理：行业分组（左）+ 产品列表（右）双区
 * 产品以独立数据表为管理源（id 寻址，pageId 仅表示关联发布页面），保存后由服务端自动派生详情页
 * 并重算 /products 列表页分组（行业分组本身就是列表页的分组结构，因此同页管理）
 * 站点切换与默认站点逻辑与新闻管理（news.vue）一致
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { catalogApi, resolveMediaUrl, sitesApi, type ProductIndustryItem, type ProductItem, type SiteItem } from '~/config/api'
import { BADGE_META } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { isLoading, run, runKeyed } = useLoading()

const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const list = ref<ProductItem[]>([])
const total = ref(0)
const keyword = ref('')
const series = ref('')
const industry = ref('')
const seriesList = ref<string[]>([])
const industries = ref<ProductIndustryItem[]>([])
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

/** 弹窗状态：editing 为 null 表示新建 */
const dialogVisible = ref(false)
const editing = ref<ProductItem | null>(null)
/** 行业分组弹窗状态：editingIndustry 为 null 表示新建 */
const industryDialogVisible = ref(false)
const editingIndustry = ref<ProductIndustryItem | null>(null)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  if (!siteId.value && sites.value.length) siteId.value = sites.value[0].id
}

/** 行业分组清单（筛选下拉、产品弹窗分组多选、左侧分组管理共用） */
async function loadIndustries() {
  if (!siteId.value) return
  const result = await catalogApi.industries(siteId.value)
  industries.value = result.list
}

async function load() {
  if (!siteId.value) return
  await run(async () => {
    const result = await catalogApi.products({
      siteId: siteId.value,
      keyword: keyword.value || undefined,
      series: series.value || undefined,
      industry: industry.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = result.list
    total.value = result.total
    seriesList.value = result.seriesList
  })
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: ProductItem) {
  editing.value = row
  dialogVisible.value = true
}

function openIndustryCreate() {
  editingIndustry.value = null
  industryDialogVisible.value = true
}

function openIndustryEdit(row: ProductIndustryItem) {
  editingIndustry.value = row
  industryDialogVisible.value = true
}

const onRemove = debounce(
  (row: ProductItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(
          `确认删除产品「${row.name}」？其详情页会一并删除，该操作不可恢复`,
          '删除确认',
          { type: 'warning' }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await catalogApi.removeProduct(row.id)
      ElMessage.success('已删除，站点正在重新构建')
      await Promise.all([load(), loadIndustries()])
    }),
  DEBOUNCE_WAIT
)

const onRemoveIndustry = debounce(
  (row: ProductIndustryItem) =>
    runKeyed(`removeIndustry:${row.id}`, async () => {
      if (row.productCount > 0) {
        ElMessage.warning(`「${row.name}」下还有 ${row.productCount} 个产品，请先调整产品分组`)
        return
      }
      try {
        await ElMessageBox.confirm(`确认删除行业分组「${row.name}」？该操作不可恢复`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await catalogApi.removeIndustry(row.id)
      ElMessage.success('已删除，站点正在重新构建')
      await loadIndustries()
    }),
  DEBOUNCE_WAIT
)

/** 弹窗保存成功：刷新列表与分组（产品数、系列清单可能变化） */
async function onSaved() {
  await Promise.all([load(), loadIndustries()])
}

async function onIndustrySaved() {
  await Promise.all([loadIndustries(), load()])
}

/** 发布状态徽标（published / pending / missing / draft，未知值兜底 info） */
function statusMeta(status: string) {
  return BADGE_META[status] ?? { label: status, type: 'info' as const }
}

watch([page, pageSize], load)
watch([series, industry], () => {
  page.value = 1
  load()
})
watch(siteId, () => {
  page.value = 1
  series.value = ''
  industry.value = ''
  load()
  loadIndustries()
})
onMounted(async () => {
  await loadSites()
  await Promise.all([load(), loadIndustries()])
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">产品体系</span>
      <el-select v-model="siteId" size="small" placeholder="选择站点" style="width: 180px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索名称"
        style="width: 160px"
        clearable
        @keyup.enter="load"
        @clear="load"
      />
      <el-select v-model="industry" size="small" placeholder="全部行业" clearable style="width: 130px">
        <el-option v-for="item in industries" :key="item.id" :label="item.name" :value="item.name" />
      </el-select>
      <el-select v-model="series" size="small" placeholder="全部系列" clearable style="width: 130px">
        <el-option v-for="item in seriesList" :key="item" :label="item" :value="item" />
      </el-select>
      <span class="spacer" />
      <el-button type="primary" size="small" @click="openCreate">新建产品</el-button>
    </div>

    <div class="split">
      <section class="panel industry-panel">
        <div class="panel-head">
          <span class="panel-title">行业分组</span>
          <el-button link type="primary" size="small" @click="openIndustryCreate">加分组</el-button>
        </div>
        <div v-loading="isLoading('industries')" class="industry-list">
          <div v-for="item in industries" :key="item.id" class="industry-row">
            <div class="industry-main">
              <span class="industry-name">{{ item.name }}</span>
              <span class="mono c-mute">{{ item.productCount }} 个产品</span>
            </div>
            <div class="industry-ops">
              <el-button link size="small" type="primary" @click="openIndustryEdit(item)">编辑</el-button>
              <el-button
                link
                size="small"
                type="danger"
                :loading="isLoading(`removeIndustry:${item.id}`)"
                @click="onRemoveIndustry(item)"
              >
                删除
              </el-button>
            </div>
          </div>
          <p v-if="!industries.length" class="c-mute empty-tip">暂无行业分组</p>
        </div>
      </section>

      <section class="panel product-panel">
        <el-table v-loading="isLoading()" :data="list" border size="small" style="width: 100%" empty-text="暂无产品">
          <el-table-column label="产品" min-width="220">
            <template #default="{ row }">
              <div class="prod-cell">
                <img v-if="row.img" :src="resolveMediaUrl(row.img)" :alt="row.name" class="prod-thumb" />
                <div class="prod-meta">
                  <span class="prod-name">{{ row.name }}</span>
                  <span class="c-mute">{{ row.cnName }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="series" label="系列" width="110" show-overflow-tooltip />
          <el-table-column label="行业分组" min-width="180">
            <template #default="{ row }">
              <el-tag v-for="item in row.industries" :key="item" size="small" effect="plain" class="tag-gap">
                {{ item }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="200" show-overflow-tooltip>
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
      </section>
    </div>

    <ProductDialog
      v-model="dialogVisible"
      :site-id="siteId"
      :product="editing"
      :industries="industries"
      @saved="onSaved"
    />
    <IndustryDialog v-model="industryDialogVisible" :site-id="siteId" :industry="editingIndustry" @saved="onIndustrySaved" />
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

/** 左右双区：左侧分组管理固定宽度，右侧产品列表自适应（内容超出时只在 .content 内滚动） */
.split {
  display: flex;
  gap: $sp-1;
  min-height: 0;
  flex: 1;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  background: var(--el-bg-color);
  padding: $sp-1;
  min-height: 0;
}

.industry-panel {
  width: 260px;
  flex: none;
}

.product-panel {
  flex: 1;
  min-width: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.industry-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  min-height: 120px;
}

.industry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $sp-1;
  padding: 4px 6px;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.industry-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.industry-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.industry-ops {
  display: flex;
  flex-wrap: nowrap;
  flex: none;
}

.empty-tip {
  margin: 0;
  padding: $sp-1 0;
}

.prod-cell {
  display: flex;
  align-items: center;
  gap: $sp-1;
}

.prod-thumb {
  width: 36px;
  height: 28px;
  object-fit: cover;
  border-radius: 2px;
  flex: none;
}

.prod-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.prod-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-gap {
  margin-right: 4px;
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
