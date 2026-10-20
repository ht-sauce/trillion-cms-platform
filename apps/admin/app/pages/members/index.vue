<script setup lang="ts">
/**
 * 站点会员管理：按站点隔离，站点管理员仅见本站会员
 * 表格：统一 border 模式（列宽可拖拽）；新建会员走独立弹窗组件 MemberCreateDialog
 */
import { ElMessageBox } from 'element-plus'
import { membersApi, sitesApi, type MemberItem } from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由动作外层的 `debounce` 单独负责 */
const { isLoading, runKeyed } = useLoading()

const sites = ref<{ id: string; name: string }[]>([])
const siteId = ref<string>()
const list = ref<MemberItem[]>([])
const total = ref(0)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const showAdd = ref(false)

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list
  if (!siteId.value && result.list.length) siteId.value = result.list[0].id
}

async function loadMembers() {
  if (!siteId.value) return
  const result = await membersApi.list({
    siteId: siteId.value,
    keyword: keyword.value || undefined,
    page: page.value,
    pageSize: pageSize.value
  })
  list.value = result.list
  total.value = result.total
}

const onRemove = debounce(
  (row: MemberItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除会员「${row.username}」？`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await membersApi.remove(row.id)
      await loadMembers()
    }),
  DEBOUNCE_WAIT
)

watch([page, pageSize], loadMembers)
watch(siteId, () => {
  page.value = 1
  loadMembers()
})
onMounted(async () => {
  await loadSites()
  await loadMembers()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">会员管理</span>
      <el-select v-model="siteId" size="small" style="width: 200px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索账号/昵称"
        style="width: 180px"
        @keyup.enter="loadMembers"
      />
      <span class="spacer" />
      <el-button type="primary" size="small" @click="showAdd = true">+ 新建会员</el-button>
    </div>

    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无会员">
      <el-table-column label="ID" width="80">
        <template #default="{ row }">
          <span class="mono">#{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="账号" min-width="160" show-overflow-tooltip />
      <el-table-column label="昵称" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.nickname || '-' }}</template>
      </el-table-column>
      <el-table-column label="注册时间" width="160">
        <template #default="{ row }">
          <span class="mono">{{ row.createdAt }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right" class-name="ops-col">
        <template #default="{ row }">
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

    <MemberCreateDialog v-model="showAdd" :site-id="siteId" @saved="loadMembers" />
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
