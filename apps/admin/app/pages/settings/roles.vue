<script setup lang="ts">
/**
 * 角色管理（系统设置 · 平台级）：角色增删改查 + 「角色 → 菜单」授权
 * 表格：统一 border 模式（列宽可拖拽）；表单与授权走独立弹窗组件
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { rolesApi, type RoleItem } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由动作外层的 `debounce` 单独负责 */
const { isLoading, run, runKeyed } = useLoading()

const list = ref<RoleItem[]>([])
const loading = ref(false)

const showFormDialog = ref(false)
const editingRole = ref<RoleItem | null>(null)

const showMenusDialog = ref(false)
const menuRole = ref<RoleItem | null>(null)

async function load() {
  loading.value = true
  try {
    const result = await rolesApi.list()
    list.value = result.list
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingRole.value = null
  showFormDialog.value = true
}

function openEdit(row: RoleItem) {
  editingRole.value = row
  showFormDialog.value = true
}

function openMenus(row: RoleItem) {
  menuRole.value = row
  showMenusDialog.value = true
}

const onRemove = debounce(
  (row: RoleItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await rolesApi.remove(row.id)
      ElMessage.success('已删除')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 刷新（防抖在外、loading 在内） */
const onRefresh = debounce(() => run(load), DEBOUNCE_WAIT)

onMounted(load)
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">角色管理</span>
      <span class="count">共 {{ list.length }} 个角色 · 用户绑定角色，角色授权菜单</span>
      <span class="spacer" />
      <el-button size="small" :loading="loading" @click="onRefresh">刷新</el-button>
      <el-button type="primary" size="small" @click="openCreate">+ 新建角色</el-button>
    </div>

    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无角色">
      <el-table-column label="角色名称" min-width="180">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.builtin" size="small" type="info" effect="plain">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="角色标识" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.code }}</span>
        </template>
      </el-table-column>
      <el-table-column width="110">
        <template #header><TermHint term="platformRole" /></template>
        <template #default="{ row }">{{ row.platform ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column width="110">
        <template #header><TermHint term="menuGrant" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.menuIds.length }}</span>
        </template>
      </el-table-column>
      <el-table-column label="绑定用户" width="96">
        <template #default="{ row }">
          <span class="mono">{{ row.userCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="row.status === 'active' ? 'c-success' : 'c-warning'">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" @click="openMenus(row)">菜单授权</el-button>
          <el-button link size="small" type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            size="small"
            type="danger"
            :disabled="row.builtin"
            :loading="isLoading(`remove:${row.id}`)"
            @click="onRemove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <RoleFormDialog v-model="showFormDialog" :role="editingRole" @saved="load" />
    <RoleMenusDialog v-model="showMenusDialog" :role="menuRole" @saved="load" />
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
</style>
