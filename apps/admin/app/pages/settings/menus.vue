<script setup lang="ts">
/**
 * 菜单管理（系统设置 · 平台级）：后台侧栏菜单的增删改查
 * 表格：统一 border 模式（列宽可拖拽）；表单：独立弹窗组件 MenuFormDialog
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { menusApi, type MenuItem, type MenuNode } from '~/config/api'
import { useMenuStore } from '~/stores/menu'
import { buildMenuTree } from '~/utils/menu-tree'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由动作外层的 `debounce` 单独负责 */
const { isLoading, run, runKeyed } = useLoading()

/** 菜单最大层级（与后端一致） */
const MAX_LEVEL = 3

const menuStore = useMenuStore()

const list = ref<MenuItem[]>([])
const loading = ref(false)

const showDialog = ref(false)
const editingMenu = ref<MenuItem | null>(null)
const defaultParentId = ref('0')

/** 表格数据：多级树（el-table 以 tree-props 渲染子级） */
const tree = computed(() => buildMenuTree(list.value))

/** 菜单 id → 层级（一级 = 1），用于限制"加子菜单" */
const levelMap = computed(() => {
  const map = new Map<string, number>()
  const walk = (nodes: MenuNode[], depth: number) => {
    for (const node of nodes) {
      map.set(node.id, depth)
      walk(node.children, depth + 1)
    }
  }
  walk(tree.value, 1)
  return map
})

async function load() {
  loading.value = true
  try {
    const result = await menusApi.list()
    list.value = result.list
  } finally {
    loading.value = false
  }
}

function openCreate(parent: string | null = null) {
  editingMenu.value = null
  defaultParentId.value = parent ?? '0'
  showDialog.value = true
}

function openEdit(row: MenuItem) {
  editingMenu.value = row
  defaultParentId.value = '0'
  showDialog.value = true
}

/** 弹窗保存成功：刷新列表与侧栏菜单 */
async function onSaved() {
  await load()
  await menuStore.load(true)
}

const onRemove = debounce(
  (row: MenuItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(`确认删除菜单「${row.title}」？`, '删除确认', { type: 'warning' })
      } catch {
        /** 用户取消 */
        return
      }
      await menusApi.remove(row.id)
      ElMessage.success('已删除')
      await onSaved()
    }),
  DEBOUNCE_WAIT
)

/**
 * 启用/停用开关（防抖在外、loading 在内）：状态可逆，直接切换不弹确认
 * 侧栏菜单只显示「启用 + 可见」项，切换后需同步侧栏（menuStore）
 */
const onToggleStatus = debounce(
  (row: MenuItem) =>
    runKeyed(`status:${row.id}`, async () => {
      const next = row.status === 'active' ? 'disabled' : 'active'
      await menusApi.update(row.id, { status: next })
      ElMessage.success(next === 'active' ? '已启用' : '已停用')
      await onSaved()
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
      <span class="panel-title">菜单管理</span>
      <span class="count">共 {{ list.length }} 项 · 最多三级 · 可见性由「角色管理」中的菜单授权决定</span>
      <span class="spacer" />
      <el-button size="small" :loading="loading" @click="onRefresh">刷新</el-button>
      <el-button type="primary" size="small" @click="openCreate(null)">+ 新建菜单</el-button>
    </div>

    <el-table
      :data="tree"
      border
      size="small"
      style="width: 100%"
      row-key="id"
      :tree-props="{ children: 'children' }"
      default-expand-all
      empty-text="暂无菜单，请先新建"
    >
      <el-table-column prop="title" label="菜单名称" min-width="220" />
      <el-table-column width="240" show-overflow-tooltip>
        <template #header><TermHint term="routePath" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.path || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="sort" label="排序" width="80">
        <template #default="{ row }">
          <span class="mono">{{ row.sort }}</span>
        </template>
      </el-table-column>
      <el-table-column label="可见" width="70">
        <template #default="{ row }">{{ row.visible ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-switch
            size="small"
            :model-value="row.status === 'active'"
            :loading="isLoading(`status:${row.id}`)"
            @change="onToggleStatus(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" :disabled="(levelMap.get(row.id) || 1) >= MAX_LEVEL" @click="openCreate(row.id)">
            加子菜单
          </el-button>
          <el-button link size="small" type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link size="small" type="danger" :loading="isLoading(`remove:${row.id}`)" @click="onRemove(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <MenuFormDialog
      v-model="showDialog"
      :menu="editingMenu"
      :default-parent-id="defaultParentId"
      :menus="list"
      @saved="onSaved"
    />
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
