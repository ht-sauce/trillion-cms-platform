<script setup lang="ts">
/**
 * 内容（页面）列表：站点 + 栏目筛选，含三态流转与 GEO 评分、发布操作
 */
import { ElMessage } from 'element-plus'
import { STATUS_META } from '~/config/menu'
import { contentApi, publishApi, sitesApi, type PageItem } from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由动作外层的 `debounce` 单独负责 */
const { isLoading, runKeyed } = useLoading()

const sites = ref<{ id: string; name: string }[]>([])
const channels = ref<{ id: string; name: string; slug: string }[]>([])
const siteId = ref<string>()
const channelId = ref<string>()
const list = ref<PageItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list
  if (!siteId.value && result.list.length) siteId.value = result.list[0].id
}

async function loadChannels() {
  if (!siteId.value) return
  channels.value = await contentApi.channels(siteId.value)
}

async function loadPages() {
  if (!siteId.value) return
  const result = await contentApi.pages({
    siteId: siteId.value,
    channelId: channelId.value,
    page: page.value,
    pageSize: pageSize.value
  })
  list.value = result.list
  total.value = result.total
}

const submit = debounce(
  (row: PageItem) =>
    runKeyed(`submit:${row.id}`, async () => {
      await contentApi.changeStatus(row.id, 'pending_review')
      ElMessage.success('已提交审核')
      await loadPages()
    }),
  DEBOUNCE_WAIT
)

const publish = debounce(
  (row: PageItem) =>
    runKeyed(`publish:${row.id}`, async () => {
      await contentApi.changeStatus(row.id, 'published')
      await publishApi.publishPage(row.siteId, [row.id])
      ElMessage.success('已发布并触发构建')
      await loadPages()
    }),
  DEBOUNCE_WAIT
)

watch(siteId, async () => {
  await loadChannels()
  await loadPages()
})
watch([channelId, page, pageSize], loadPages)

onMounted(async () => {
  await loadSites()
  await loadChannels()
  await loadPages()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">内容 / 页面</span>
      <el-select v-model="siteId" size="small" style="width: 200px">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <el-select v-model="channelId" size="small" clearable placeholder="全部栏目" style="width: 140px">
        <el-option v-for="c in channels" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <span class="spacer" />
      <el-button type="primary" size="small" @click="navigateTo('/content/new')">+ 新建页面</el-button>
    </div>

    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无页面">
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column width="160">
        <template #header><TermHint term="urlSlug" /></template>
        <template #default="{ row }">
          <span class="mono">/{{ row.slug }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <span :class="STATUS_META[row.status]?.className">{{ STATUS_META[row.status]?.label }}</span>
        </template>
      </el-table-column>
      <el-table-column width="100">
        <template #header><TermHint term="geoScore" /></template>
        <template #default="{ row }">
          <span
            class="mono"
            :class="(row.geoScore || 0) >= 80 ? 'c-success' : (row.geoScore || 0) >= 60 ? 'c-warning' : 'c-danger'"
          >
            {{ row.geoScore }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="作者" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.authorName || '-' }}</template>
      </el-table-column>
      <el-table-column label="发布时间" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.publishedAt || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="navigateTo(`/content/${row.id}`)">编辑</el-button>
          <el-button
            v-if="row.status === 'draft'"
            link
            size="small"
            type="success"
            :loading="isLoading(`submit:${row.id}`)"
            @click="submit(row)"
          >
            提交审核
          </el-button>
          <el-button
            v-else
            link
            size="small"
            type="success"
            :loading="isLoading(`publish:${row.id}`)"
            @click="publish(row)"
          >
            发布
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

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
