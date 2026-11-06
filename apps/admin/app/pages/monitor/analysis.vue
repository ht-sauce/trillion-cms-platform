<script setup lang="ts">
import {
  ACCESS_CATEGORY_OPTIONS,
  ACCESS_RESOURCE_OPTIONS,
  ACCESS_STATUS_OPTIONS,
  accessApi,
  sitesApi,
  type AccessCategory,
  type AccessResourceType,
  type AccessSummary,
  type AccessSummaryQuery,
  type SiteItem
} from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const { isLoading, run } = useLoading()
const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const summary = ref<AccessSummary | null>(null)
const error = ref('')
const siteId = ref('')
const dateRange = ref<[string, string] | null>(null)
const clientIp = ref('')
const path = ref('')
const resourceType = ref<AccessResourceType | ''>('')
const accessCategory = ref<AccessCategory | ''>('')
const agentToken = ref('')
const status = ref<number>()
const appliedQuery = ref<AccessSummaryQuery>({})
let pendingQuery: AccessSummaryQuery = {}
let requestVersion = 0
let disposed = false

const categoryLabel = (category: string) =>
  ACCESS_CATEGORY_OPTIONS.find((item) => item.value === category)?.label || '未知'
const ratioText = (ratio: number | null) => (ratio === null ? '不适用' : `${(ratio * 100).toFixed(1)}%`)
const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { top: 8, bottom: 'auto', data: ACCESS_CATEGORY_OPTIONS.map((item) => item.label) },
  grid: { left: 48, right: 16, top: 48, bottom: 32 },
  xAxis: {
    type: 'category',
    data: summary.value?.trend.map((item) => item.bucket) || [],
    axisLabel: {
      margin: 8,
      hideOverlap: true,
      formatter: (value: string) => (summary.value?.granularity === 'hour' ? value.slice(11, 16) : value.slice(5, 10))
    }
  },
  yAxis: { type: 'value', minInterval: 1 },
  series: ACCESS_CATEGORY_OPTIONS.map((item) => ({
    name: item.label,
    type: 'line',
    showSymbol: true,
    data: summary.value?.trend.map((row) => row[item.value]) || []
  }))
}))
const categoryOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 80, right: 40, top: 16, bottom: 24 },
  xAxis: { type: 'value', minInterval: 1 },
  yAxis: {
    type: 'category',
    inverse: true,
    data: summary.value?.categories.map((item) => categoryLabel(item.category)) || []
  },
  series: [
    {
      type: 'bar',
      label: { show: true, position: 'right' },
      data: summary.value?.categories.map((item) => item.requests) || []
    }
  ]
}))
const statusRows = computed(() =>
  ACCESS_STATUS_OPTIONS.map((item) => ({
    ...item,
    requests: summary.value?.statuses[item.value] ?? 0
  }))
)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  if (!disposed) sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
}

async function load() {
  if (disposed) return
  pendingQuery = {
    siteId: siteId.value || undefined,
    from: dateRange.value?.[0],
    to: dateRange.value?.[1],
    clientIp: clientIp.value || undefined,
    path: path.value || undefined,
    resourceType: resourceType.value || undefined,
    accessCategory: accessCategory.value || undefined,
    agentToken: agentToken.value || undefined,
    status: status.value
  }
  requestVersion += 1
  await run(async () => {
    while (!disposed) {
      const version = requestVersion
      const query = { ...pendingQuery }
      summary.value = null
      error.value = ''
      try {
        const result = await accessApi.summary(query)
        if (!disposed && version === requestVersion) {
          summary.value = result
          appliedQuery.value = { ...query, from: result.range.from, to: result.range.to }
        }
      } catch (cause) {
        if (!disposed && version === requestVersion)
          error.value = cause instanceof Error ? cause.message : '访问分析读取失败'
      }
      if (version === requestVersion) return
    }
  })
}

const onSearch = debounce(load, { wait: DEBOUNCE_WAIT, trailing: true })
const onReset = debounce(() => {
  siteId.value = ''
  dateRange.value = null
  clientIp.value = ''
  path.value = ''
  resourceType.value = ''
  accessCategory.value = ''
  agentToken.value = ''
  status.value = undefined
  load()
}, DEBOUNCE_WAIT)

function quickRange(days: number) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const start = new Date(`${today}T00:00:00+08:00`)
  start.setTime(start.getTime() - (days - 1) * 86_400_000)
  const from = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(start)
  dateRange.value = [`${from} 00:00:00`, `${today} 23:59:59`]
  onSearch()
}

function drill(extra: AccessSummaryQuery = {}) {
  if (!summary.value || isLoading()) return
  const query = Object.fromEntries(
    Object.entries({ ...appliedQuery.value, ...extra }).filter(([, value]) => value !== undefined && value !== '')
  )
  navigateTo({ path: '/monitor', query })
}

function drillBucket(index: number, category: AccessCategory, bucket = summary.value?.trend[index]?.bucket) {
  if (!summary.value || !bucket) return
  const step = summary.value.granularity === 'hour' ? 3_600_000 : 86_400_000
  const end = new Date(new Date(`${bucket.replace(' ', 'T')}+08:00`).getTime() + step - 1000)
  const toText = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(end)
  drill({
    accessCategory: category,
    from: bucket < summary.value.range.from ? summary.value.range.from : bucket,
    to: toText > summary.value.range.to ? summary.value.range.to : toText
  })
}

onMounted(async () => {
  await Promise.allSettled([loadSites(), load()])
})
onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <div class="page-wrap analysis-page">
    <div class="filter-bar">
      <span class="panel-title">访问分析</span>
      <el-select v-model="siteId" placeholder="全部站点" clearable class="filter-site">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        value-format="YYYY-MM-DD HH:mm:ss"
        range-separator="至"
        start-placeholder="默认最近 7 天"
        end-placeholder="最长 90 天"
      />
      <el-select v-model="accessCategory" placeholder="访问类别" clearable>
        <el-option v-for="item in ACCESS_CATEGORY_OPTIONS" :key="item.value" v-bind="item" />
      </el-select>
      <div class="filter-actions">
        <el-button @click="quickRange(1)">今天</el-button>
        <el-button @click="quickRange(7)">最近 7 天</el-button>
        <el-button @click="quickRange(30)">最近 30 天</el-button>
      </div>
    </div>
    <div class="filter-bar">
      <el-input v-model="clientIp" placeholder="客户端 IP" clearable @keyup.enter="onSearch" />
      <el-input v-model="path" placeholder="路径包含" clearable @keyup.enter="onSearch" />
      <el-select v-model="resourceType" placeholder="资源类型" clearable>
        <el-option v-for="item in ACCESS_RESOURCE_OPTIONS" :key="item.value" v-bind="item" />
      </el-select>
      <el-input v-model="agentToken" placeholder="代理标识" clearable @keyup.enter="onSearch" />
      <el-input-number v-model="status" :controls="false" placeholder="状态码" />
      <div class="filter-actions">
        <el-button type="primary" :loading="isLoading()" @click="onSearch">查询</el-button>
        <el-button :loading="isLoading()" @click="onSearch">刷新</el-button>
        <el-button @click="onReset">重置</el-button>
      </div>
    </div>
    <div class="notice">
      仅统计到达 GEO 且已保存的请求，不代表 PV/UV、AI 引用、曝光或转化。AI 身份为 UA
      声明；今天尚未结束，未来时间桶不代表预测。中国时区，最长连续 90 个自然日。
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon>
      <el-button @click="onSearch">重试</el-button>
    </el-alert>
    <div v-if="isLoading()" v-loading="true" class="loading-state">正在读取全量匹配请求</div>
    <template v-else-if="summary">
      <div class="notice mono">
        {{ summary.range.from }} 至 {{ summary.range.to }} · {{ summary.range.timezone }} · 按{{
          summary.granularity === 'hour' ? '小时' : '天'
        }}统计（首尾桶可能不完整）
      </div>
      <div class="metrics">
        <div class="metric">
          <span>记录请求数（含全部资源）</span><strong class="mono">{{ summary.totals.requests }}</strong>
        </div>
        <div class="metric">
          <span>页面请求数</span><strong class="mono">{{ summary.totals.pageRequests }}</strong>
        </div>
        <div class="metric">
          <span>声明 AI 爬虫请求数</span><strong class="mono">{{ summary.totals.aiBotRequests }}</strong>
        </div>
        <div class="metric">
          <span>异常请求数（4xx/5xx 或中断，去重）</span
          ><strong class="mono">{{ summary.totals.abnormalRequests }}</strong>
        </div>
      </div>
      <el-empty
        v-if="summary.totals.requests === 0"
        description="当前条件没有已保存请求；零分母占比不适用，可调整条件后查询"
      />
      <div class="chart-grid">
        <div class="chart-panel">
          <div class="panel-title">请求趋势 · 点击时间点查看记录</div>
          <AccessChart
            :option="trendOption"
            label="四类请求趋势"
            @select="(index, series) => drillBucket(index, ACCESS_CATEGORY_OPTIONS[series]!.value)"
          />
        </div>
        <div class="chart-panel">
          <div class="panel-title">访问类别 · 点击条形查看记录</div>
          <AccessChart
            :option="categoryOption"
            label="访问类别请求数"
            @select="(index) => drill({ accessCategory: summary!.categories[index]!.category })"
          />
          <div class="category-ratios">
            <span v-for="item in summary.categories" :key="item.category"
              >{{ categoryLabel(item.category) }}
              <span class="mono">{{ item.requests }} / {{ ratioText(item.ratio) }}</span></span
            >
          </div>
        </div>
      </div>
      <div class="table-section">
        <div class="panel-title">声明爬虫 Top 10</div>
        <el-table :data="summary.crawlers" border empty-text="暂无声明爬虫请求">
          <el-table-column label="类别" width="100"
            ><template #default="{ row }">{{ categoryLabel(row.category) }}</template></el-table-column
          >
          <el-table-column label="代理标识" min-width="160"
            ><template #default="{ row }">{{ row.agentToken ?? '—' }}</template></el-table-column
          >
          <el-table-column label="厂商" min-width="120"
            ><template #default="{ row }">{{ row.vendor ?? '—' }}</template></el-table-column
          >
          <el-table-column prop="requests" label="请求数" width="90" class-name="mono" />
          <el-table-column prop="success" label="2xx" width="80" class-name="mono" />
          <el-table-column prop="notModified" label="304" width="80" class-name="mono" />
          <el-table-column prop="abnormalRequests" label="异常数" width="90" class-name="mono" />
          <el-table-column prop="lastRequestedAt" label="最后请求时间" width="170" class-name="mono" />
          <el-table-column label="操作" width="110" class-name="ops-col"
            ><template #default="{ row }"
              ><el-button
                v-if="row.agentToken"
                link
                size="small"
                @click="drill({ accessCategory: row.category, agentToken: row.agentToken })"
                >查看记录</el-button
              ><span v-else>无法精确筛选</span></template
            ></el-table-column
          >
        </el-table>
      </div>
      <div class="table-section">
        <div class="panel-title">热门页面 Top 10</div>
        <div class="notice">
          按 Host + 路径分组。当前明细不支持按 Host 与路径精确筛选，不提供伪精确下钻；可在顶部设置路径包含条件。
        </div>
        <el-table :data="summary.pages" border empty-text="暂无页面请求">
          <el-table-column prop="host" label="Host" min-width="180" show-overflow-tooltip />
          <el-table-column prop="path" label="页面路径" min-width="240" show-overflow-tooltip />
          <el-table-column prop="requests" label="请求数" width="100" class-name="mono" />
          <el-table-column prop="aiBotRequests" label="声明 AI 请求" width="120" class-name="mono" />
          <el-table-column prop="abnormalRequests" label="异常数" width="100" class-name="mono" />
        </el-table>
      </div>
      <div class="table-section">
        <div class="panel-title">GEO 文件请求</div>
        <el-table :data="summary.resources" border>
          <el-table-column prop="resourceType" label="资源" min-width="100" />
          <el-table-column prop="requests" label="请求数" width="90" class-name="mono" />
          <el-table-column
            v-for="item in ACCESS_STATUS_OPTIONS"
            :key="item.value"
            :label="item.label"
            min-width="100"
            class-name="mono"
            ><template #default="{ row }">{{ row.statuses[item.value] }}</template></el-table-column
          >
          <el-table-column label="操作" width="100" class-name="ops-col"
            ><template #default="{ row }"
              ><el-button link size="small" @click="drill({ resourceType: row.resourceType })"
                >查看记录</el-button
              ></template
            ></el-table-column
          >
        </el-table>
      </div>
      <div class="table-section">
        <div class="panel-title">响应分布</div>
        <div class="notice">前六组互斥；中断是独立重叠维度，不可与六组相加。304 不是错误或普通重定向。</div>
        <el-table :data="statusRows" border>
          <el-table-column prop="label" label="响应组" min-width="180" />
          <el-table-column prop="requests" label="请求数" min-width="100" class-name="mono" />
          <el-table-column label="操作" width="120" class-name="ops-col"
            ><template #default="{ row }"
              ><el-button v-if="row.value === 'notModified'" link size="small" @click="drill({ status: 304 })"
                >查看记录</el-button
              ></template
            ></el-table-column
          >
        </el-table>
      </div>
      <div class="table-section">
        <div class="panel-title">外部来源域名 Top 10</div>
        <div class="notice mono">
          外部 {{ summary.referrerSummary.external }} · 内部 {{ summary.referrerSummary.internal }} · 未提供来源
          {{ summary.referrerSummary.missing }} · 无效来源 {{ summary.referrerSummary.invalid }}（未提供不等于直接访问）
        </div>
        <el-table :data="summary.referrers" border empty-text="暂无外部来源">
          <el-table-column prop="domain" label="去敏域名" min-width="220" />
          <el-table-column prop="requests" label="带来源请求数" width="140" class-name="mono" />
        </el-table>
      </div>
      <div class="table-section">
        <div class="panel-title">历史地域 Top 10</div>
        <div class="notice">
          网络出口近似位置，历史快照不重新解析 IP。<el-link
            href="https://db-ip.com"
            target="_blank"
            rel="noopener noreferrer"
            >IP Geolocation by DB-IP</el-link
          >
          · {{ summary.locationAttribution.name }}
        </div>
        <el-table :data="summary.locations" border empty-text="暂无历史地域记录">
          <el-table-column
            v-for="field in ['country', 'region', 'city', 'geoStatus', 'geoSource']"
            :key="field"
            :label="
              (
                {
                  country: '国家',
                  region: '省州',
                  city: '城市',
                  geoStatus: '解析状态',
                  geoSource: '数据来源'
                } as Record<string, string>
              )[field]
            "
            min-width="140"
            ><template #default="{ row }">{{ row[field] ?? '—' }}</template></el-table-column
          >
          <el-table-column prop="requests" label="请求数" width="100" class-name="mono" />
        </el-table>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.analysis-page {
  gap: $sp-1;
}
.filter-bar .el-input,
.filter-bar .el-select,
.filter-bar .el-input-number {
  flex: 0 0 auto;
  width: calc($sp-4 * 4);
}
.filter-bar .filter-site {
  width: calc($sp-4 * 6);
}
.filter-bar :deep(.el-date-editor) {
  flex: 0 0 auto;
  width: calc($sp-4 * 12);
  max-width: 100%;
  height: $control-height;
  box-sizing: border-box;
}
.notice {
  color: $c-text-mute;
  font-size: $font-size-base;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: $sp-1;
}
.metric {
  display: flex;
  flex-direction: column;
  padding: $sp-1;
  border: 1px solid $c-border;
  border-radius: $radius-md;
  background: $c-panel;
}
.metric strong {
  font-size: $font-size-figure;
}
.chart-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: $sp-1;
}
.chart-panel {
  min-width: 0;
  background: $c-panel;
  border: 1px solid $c-border;
  padding: $sp-1;
  border-radius: $radius-md;
}
.table-section {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}
.category-ratios {
  display: flex;
  flex-wrap: wrap;
  gap: $sp-1;
}
.loading-state {
  min-height: calc($sp-4 * 6);
  padding: $sp-1;
}
@media (max-width: 960px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
