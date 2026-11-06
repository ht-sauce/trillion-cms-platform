<script setup lang="ts">
/**
 * 需求收集列表：站点、跟进状态与关键词筛选，详情通过独立弹窗处理
 */
import { demandsApi, sitesApi, type DemandItem, type DemandStatus, type SiteItem } from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { useLoading } from '~/utils/tool'

const { isLoading, run } = useLoading()
const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const status = ref<'all' | DemandStatus>('all')
const keyword = ref('')
const list = ref<DemandItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const dialogVisible = ref(false)
const demandId = ref<string | null>(null)

const statusMeta: Record<DemandStatus, { label: string; type: 'warning' | 'success' }> = {
  pending: { label: '待跟进', type: 'warning' },
  followed: { label: '已跟进', type: 'success' }
}

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
}

async function load() {
  await run(async () => {
    const result = await demandsApi.list({
      siteId: siteId.value || undefined,
      status: status.value === 'all' ? undefined : status.value,
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = result.list
    total.value = result.total
  })
}

function applyFilter() {
  if (page.value === 1) void load()
  else page.value = 1
}

function openDetail(row: DemandItem) {
  demandId.value = row.id
  dialogVisible.value = true
}

watch([page, pageSize], load)
onMounted(async () => {
  await loadSites()
  await load()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">需求收集</span>
      <el-select v-model="siteId" placeholder="全部站点" clearable style="width: 200px" @change="applyFilter">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <el-select v-model="status" style="width: 120px" @change="applyFilter">
        <el-option label="全部状态" value="all" />
        <el-option label="待跟进" value="pending" />
        <el-option label="已跟进" value="followed" />
      </el-select>
      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索需求/称呼/联系方式"
        style="width: 220px"
        @keyup.enter="applyFilter"
        @clear="applyFilter"
      />
      <el-button @click="applyFilter">查询</el-button>
    </div>

    <el-table v-loading="isLoading()" :data="list" border style="width: 100%" empty-text="暂无需求">
      <el-table-column prop="siteName" label="站点" width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.siteName || row.siteId }}</template>
      </el-table-column>
      <el-table-column prop="description" label="需求描述" min-width="240" show-overflow-tooltip />
      <el-table-column label="称呼/联系方式" min-width="190" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.contactName || '未留称呼' }} · {{ row.phone || row.wechat || row.email || row.otherContact || '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="sourceUrl" label="来源页面" min-width="180" show-overflow-tooltip>
        <template #default="{ row }"
          ><span class="mono">{{ row.sourceUrl || '—' }}</span></template
        >
      </el-table-column>
      <el-table-column label="提交时间" width="152">
        <template #default="{ row }"
          ><span class="mono">{{ row.createdAt }}</span></template
        >
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusMeta[row.status]?.type || 'info'" effect="plain">
            {{ statusMeta[row.status]?.label || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
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

    <DemandDetailDialog v-model="dialogVisible" :demand-id="demandId" @saved="load" />
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
