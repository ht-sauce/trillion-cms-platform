<script setup lang="ts">
/**
 * 高频问答管理：按站点隔离的问答列表 + 关键词/分类筛选 + 新建/编辑/删除
 * 问答以独立数据表为管理源（id 寻址，pageId 仅表示关联页面），保存后由服务端自动触发站点构建
 * 分类下拉选项来自分类接口（去重清单），新建问答可输入新分类，保存后刷新分类
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { newsFaqApi, sitesApi, type FaqItem, type SiteItem } from '~/config/api'
import { BADGE_META } from '~/config/menu'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { isLoading, run, runKeyed } = useLoading()

const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const list = ref<FaqItem[]>([])
const total = ref(0)
const keyword = ref('')
const category = ref('')
const categories = ref<string[]>([])
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

/** 弹窗状态：editing 为 null 表示新建 */
const dialogVisible = ref(false)
const editing = ref<FaqItem | null>(null)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  if (!siteId.value && sites.value.length) siteId.value = sites.value[0].id
}

/** 分类清单（筛选下拉与弹窗表单共用；清空筛选 = 全部分类） */
async function loadCategories() {
  if (!siteId.value) return
  const result = await newsFaqApi.faqCategories(siteId.value)
  categories.value = result.list
}

async function load() {
  if (!siteId.value) return
  await run(async () => {
    const result = await newsFaqApi.faqList({
      siteId: siteId.value,
      keyword: keyword.value || undefined,
      category: category.value || undefined,
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

function openEdit(row: FaqItem) {
  editing.value = row
  dialogVisible.value = true
}

const onRemove = debounce(
  (row: FaqItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除问答「${row.question}」？该操作不可恢复`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await newsFaqApi.removeFaq(row.id)
      ElMessage.success('已删除，站点正在重新构建')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 弹窗保存成功：刷新列表并重载分类清单（可能输入了新分类） */
async function onSaved() {
  await load()
  await loadCategories()
}

/** 发布状态徽标（published / pending / missing / draft，未知值兜底 info） */
function statusMeta(status: string) {
  return BADGE_META[status] ?? { label: status, type: 'info' as const }
}

watch([page, pageSize], load)
watch(siteId, () => {
  page.value = 1
  load()
  loadCategories()
})
onMounted(async () => {
  await loadSites()
  await load()
  await loadCategories()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">高频问答</span>
      <el-select v-model="siteId" size="small" placeholder="选择站点" style="width: 200px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索问题"
        style="width: 180px"
        clearable
        @keyup.enter="load"
        @clear="load"
      />
      <el-select
        v-model="category"
        size="small"
        placeholder="全部分类"
        clearable
        filterable
        style="width: 140px"
        @change="load"
      >
        <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
      </el-select>
      <span class="spacer" />
      <el-button type="primary" size="small" @click="openCreate">新建</el-button>
    </div>

    <el-table v-loading="isLoading()" :data="list" border size="small" style="width: 100%" empty-text="暂无问答">
      <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="110" show-overflow-tooltip />
      <el-table-column min-width="200" show-overflow-tooltip>
        <template #header><TermHint term="pageAddress" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.path }}</span>
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

    <FaqDialog v-model="dialogVisible" :site-id="siteId" :faq="editing" :categories="categories" @saved="onSaved" />
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
