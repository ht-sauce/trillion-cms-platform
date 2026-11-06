<script setup lang="ts">
/**
 * GEO 监控：按站点与请求特征筛选入站访问明细
 */
import {
  ACCESS_CATEGORY_OPTIONS,
  ACCESS_COMPLETION_LABEL,
  ACCESS_RESOURCE_OPTIONS,
  accessApi,
  sitesApi,
  type AccessCategory,
  type AccessEventItem,
  type AccessResourceType,
  type SiteItem
} from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const { isLoading, run } = useLoading()
const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const list = ref<AccessEventItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const siteId = ref('')
const dateRange = ref<[string, string] | null>(null)
const clientIp = ref('')
const path = ref('')
const resourceType = ref<AccessResourceType | ''>('')
const accessCategory = ref<AccessCategory | ''>('')
const agentToken = ref('')
const status = ref<number>()
const route = useRoute()

function applyRouteQuery() {
  const text = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')
  siteId.value = text('siteId')
  dateRange.value = text('from') && text('to') ? [text('from'), text('to')] : null
  clientIp.value = text('clientIp')
  path.value = text('path')
  resourceType.value = ACCESS_RESOURCE_OPTIONS.find((option) => option.value === text('resourceType'))?.value || ''
  accessCategory.value = ACCESS_CATEGORY_OPTIONS.find((option) => option.value === text('accessCategory'))?.value || ''
  agentToken.value = text('agentToken')
  status.value = /^\d+$/.test(text('status')) ? Number(text('status')) : undefined
}

applyRouteQuery()
let requestVersion = 0
let disposed = false

const siteNames = computed(() => new Map(sites.value.map((site) => [site.id, site.name])))
const resourceLabels = new Map(ACCESS_RESOURCE_OPTIONS.map((option) => [option.value, option.label]))
const categoryLabels = new Map(ACCESS_CATEGORY_OPTIONS.map((option) => [option.value, option.label]))

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  if (!disposed) sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
}

async function load() {
  requestVersion += 1
  await run(async () => {
    while (!disposed) {
      const version = requestVersion
      try {
        const result = await accessApi.list({
          siteId: siteId.value || undefined,
          from: dateRange.value?.[0],
          to: dateRange.value?.[1],
          clientIp: clientIp.value || undefined,
          path: path.value || undefined,
          resourceType: resourceType.value || undefined,
          accessCategory: accessCategory.value || undefined,
          agentToken: agentToken.value || undefined,
          status: status.value,
          page: page.value,
          pageSize: pageSize.value
        })
        if (!disposed && version === requestVersion) {
          list.value = result.list
          total.value = result.total
        }
      } catch {
        if (version === requestVersion) return
      }
      if (version === requestVersion) return
    }
  })
}

function reloadFromFirstPage() {
  if (page.value === 1) load()
  else page.value = 1
}

const onSearch = debounce(reloadFromFirstPage, DEBOUNCE_WAIT)
const onReset = debounce(() => {
  siteId.value = ''
  dateRange.value = null
  clientIp.value = ''
  path.value = ''
  resourceType.value = ''
  accessCategory.value = ''
  agentToken.value = ''
  status.value = undefined
  reloadFromFirstPage()
}, DEBOUNCE_WAIT)

function locationText(row: AccessEventItem) {
  return [row.country, row.region, row.city].filter(Boolean).join(' / ') || '—'
}

watch([page, pageSize], load)
watch(
  () => route.query,
  () => {
    applyRouteQuery()
    reloadFromFirstPage()
  }
)
onMounted(async () => {
  await Promise.allSettled([loadSites(), load()])
})
onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <div class="page-wrap">
    <div class="filter-bar">
      <span class="panel-title">访问记录</span>
      <el-select v-model="siteId" class="filter-site" placeholder="全部站点" clearable>
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        class="filter-date"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        value-format="YYYY-MM-DD HH:mm:ss"
      />
      <el-input v-model="clientIp" class="filter-text" placeholder="客户端 IP" clearable @keyup.enter="onSearch" />
      <el-input v-model="path" class="filter-text" placeholder="访问路径" clearable @keyup.enter="onSearch" />
      <el-select v-model="resourceType" class="filter-select" placeholder="资源类型" clearable>
        <el-option v-for="option in ACCESS_RESOURCE_OPTIONS" :key="option.value" v-bind="option" />
      </el-select>
      <el-select v-model="accessCategory" class="filter-select" placeholder="访问类别" clearable>
        <el-option v-for="option in ACCESS_CATEGORY_OPTIONS" :key="option.value" v-bind="option" />
      </el-select>
      <el-input v-model="agentToken" class="filter-text" placeholder="代理标识" clearable @keyup.enter="onSearch" />
      <el-input-number
        v-model="status"
        class="filter-status"
        :min="100"
        :max="599"
        :controls="false"
        placeholder="状态码"
      />
      <div class="filter-actions">
        <el-button type="primary" :loading="isLoading()" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
      </div>
    </div>

    <el-table v-loading="isLoading()" :data="list" border empty-text="暂无访问明细">
      <el-table-column label="访问时间" width="150" fixed="left">
        <template #default="{ row }"
          ><span class="mono">{{ row.occurredAt }}</span></template
        >
      </el-table-column>
      <el-table-column label="站点" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ (row.siteId && siteNames.get(row.siteId)) || row.host }}</template>
      </el-table-column>
      <el-table-column label="请求" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="mono">{{ row.method }} {{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column label="客户端 IP" width="136">
        <template #default="{ row }"
          ><span class="mono">{{ row.clientIp }}</span></template
        >
      </el-table-column>
      <el-table-column label="访问类别" width="92">
        <template #default="{ row }">{{ categoryLabels.get(row.accessCategory) }}</template>
      </el-table-column>
      <el-table-column label="资源类型" width="92">
        <template #default="{ row }">{{ resourceLabels.get(row.resourceType) }}</template>
      </el-table-column>
      <el-table-column label="代理 / 厂商" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.agentToken || row.vendor || '—' }}</template>
      </el-table-column>
      <el-table-column label="浏览器" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{
          [row.browserName, row.browserVersion].filter(Boolean).join(' ') || '—'
        }}</template>
      </el-table-column>
      <el-table-column label="状态" width="72">
        <template #default="{ row }"
          ><span class="mono">{{ row.status ?? '—' }}</span></template
        >
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="{ row }"
          ><span class="mono">{{ row.durationMs }} ms</span></template
        >
      </el-table-column>
      <el-table-column label="结果" width="78">
        <template #default="{ row }">{{ ACCESS_COMPLETION_LABEL[row.completion] }}</template>
      </el-table-column>
      <el-table-column label="地区" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ locationText(row) }}</template>
      </el-table-column>
      <el-table-column prop="referer" label="来源" min-width="220" show-overflow-tooltip>
        <template #default="{ row }"
          ><span class="mono">{{ row.referer || '—' }}</span></template
        >
      </el-table-column>
      <el-table-column prop="userAgent" label="User-Agent" min-width="300" show-overflow-tooltip />
    </el-table>

    <div class="pager">
      <el-link href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP Geolocation by DB-IP</el-link>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="PAGE_SIZE_OPTIONS"
        :layout="PAGINATION_LAYOUT"
        small
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.filter-site {
  width: calc($sp-4 * 6);
}

.filter-date {
  width: calc($sp-4 * 8);
}

.filter-text {
  width: calc($sp-4 * 4);
}

.filter-select {
  width: calc($sp-4 * 3);
}

.filter-status {
  width: calc($sp-4 * 2.5);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $sp-1;
  flex-wrap: wrap;
  padding-inline: $sp-1;
}
</style>
