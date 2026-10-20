<script setup lang="ts">
/**
 * 用户管理（系统设置 · 平台级）：后台用户增删改查 + 「用户 → 角色」绑定
 * 表格：统一 border 模式（列宽可拖拽）；表单走独立弹窗组件 AdminUserFormDialog
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminUsersApi, rolesApi, sitesApi, type AdminUserItem, type RoleItem } from '~/config/api'
import { TERMS } from '~/config/glossary'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由动作外层的 `debounce` 单独负责 */
const { isLoading, run, runKeyed } = useLoading()

const list = ref<AdminUserItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const keyword = ref('')
const roleFilter = ref<string | ''>('')
const loading = ref(false)

const roles = ref<RoleItem[]>([])
const sites = ref<{ id: string; name: string }[]>([])

const showDialog = ref(false)
const editingUser = ref<AdminUserItem | null>(null)

async function load() {
  loading.value = true
  try {
    const result = await adminUsersApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      roleId: roleFilter.value || undefined
    })
    list.value = result.list
    total.value = result.total
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  const [roleResult, siteResult] = await Promise.all([rolesApi.list(), sitesApi.list({ pageSize: 100 })])
  roles.value = roleResult.list
  sites.value = siteResult.list
}

/** 站点授权展示：平台级角色为全部站点，其余按授权站点名拼接 */
function siteLabel(row: AdminUserItem) {
  if (row.platform) return '全部站点'
  if (!row.siteIds.length) return '-'
  return row.siteIds.map((id) => sites.value.find((site) => site.id === id)?.name || `#${id}`).join('、')
}

function openCreate() {
  editingUser.value = null
  showDialog.value = true
}

function openEdit(row: AdminUserItem) {
  editingUser.value = row
  showDialog.value = true
}

const onRemove = debounce(
  (row: AdminUserItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除用户「${row.username}」？`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await adminUsersApi.remove(row.id)
      ElMessage.success('已删除')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 刷新（防抖在外、loading 在内） */
const onRefresh = debounce(() => run(load), DEBOUNCE_WAIT)

watch([page, pageSize, roleFilter], load)
onMounted(async () => {
  await loadOptions()
  await load()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">用户管理</span>
      <span class="count">共 {{ total }} 个账号</span>
      <span class="spacer" />
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索账号 / 展示名称"
        style="width: 180px"
        @keyup.enter="load"
      />
      <el-select v-model="roleFilter" size="small" clearable placeholder="全部角色" style="width: 140px">
        <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
      </el-select>
      <el-button size="small" :loading="loading" @click="onRefresh">刷新</el-button>
      <el-button type="primary" size="small" @click="openCreate">+ 新建用户</el-button>
    </div>

    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无用户">
      <el-table-column label="账号" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.username }}</span>
        </template>
      </el-table-column>
      <el-table-column label="展示名称" width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.displayName || '-' }}</template>
      </el-table-column>
      <el-table-column label="角色" width="180">
        <template #default="{ row }">
          {{ row.roleName }}
          <el-tag v-if="row.platform" size="small" type="warning" effect="plain">
            {{ TERMS.platformRole.label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column min-width="200" show-overflow-tooltip>
        <template #header><TermHint term="siteGrant" /></template>
        <template #default="{ row }">{{ siteLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="row.enabled ? 'c-success' : 'c-warning'">
            {{ row.enabled ? '启用' : '停用' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          <span class="mono">{{ row.createdAt }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right" class-name="ops-col">
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

    <AdminUserFormDialog v-model="showDialog" :user="editingUser" :roles="roles" :sites="sites" @saved="load" />
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .count {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }

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
