<script setup lang="ts">
/**
 * 菜单表单弹窗（新建 / 编辑菜单）
 * 规范：弹窗一律独立组件，父页面只用 v-model 控制显隐、监听 saved 刷新数据
 */
import { ElMessage } from 'element-plus'
import { menusApi, type MenuItem, type MenuNode, type MenuPayload, type MenuStatus } from '~/config/api'
import { buildMenuTree } from '~/utils/menu-tree'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 编辑对象；null 表示新建 */
  menu: MenuItem | null
  /** 新建时的默认上级菜单 ID（'0' = 顶级） */
  defaultParentId?: string
  /** 全部菜单（构建上级选择器与环路校验） */
  menus: MenuItem[]
}>()
const emit = defineEmits<{ saved: [] }>()

/** 上级菜单下拉选项（id='0' 表示顶级） */
interface ParentOption {
  id: string
  title: string
  children: ParentOption[]
}

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const parentId = ref('0')
const form = reactive({
  title: '',
  path: '',
  sort: 0,
  visible: true,
  status: 'active' as MenuStatus
})

const editingId = computed(() => props.menu?.id ?? null)

/** 上级菜单候选：编辑时排除自身及其子树，避免把父级指向自己的后代 */
const parentOptions = computed(() => {
  const roots = buildMenuTree(props.menus)
  const nodes = editingId.value ? pruneTree(roots, editingId.value) : roots
  return [{ id: '0', title: '顶级菜单', children: nodes.map(toOption) }]
})

function toOption(node: MenuNode): ParentOption {
  return { id: node.id, title: node.title, children: node.children.map(toOption) }
}

/** 剔除指定节点及其子树 */
function pruneTree(nodes: MenuNode[], id: string): MenuNode[] {
  return nodes.filter((node) => node.id !== id).map((node) => ({ ...node, children: pruneTree(node.children, id) }))
}

/** 每次打开时重置并按传入值回显 */
watch(visible, (open) => {
  if (!open) return
  const menu = props.menu
  parentId.value = menu?.parentId ?? props.defaultParentId ?? '0'
  form.title = menu?.title ?? ''
  form.path = menu?.path ?? ''
  form.sort = menu?.sort ?? 0
  form.visible = menu?.visible ?? true
  form.status = menu?.status ?? 'active'
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!form.title.trim()) {
    ElMessage.warning('请输入菜单名称')
    return
  }
  const path = form.path.trim()
  if (path && !path.startsWith('/')) {
    ElMessage.warning('路由路径需以 / 开头')
    return
  }

  const payload: MenuPayload = {
    parentId: parentId.value && parentId.value !== '0' ? parentId.value : null,
    title: form.title.trim(),
    path: path || null,
    sort: Number(form.sort) || 0,
    visible: form.visible,
    status: form.status
  }

  return run(async () => {
    if (editingId.value) await menusApi.update(editingId.value, payload)
    else await menusApi.create(payload)
    ElMessage.success(editingId.value ? '菜单已更新' : '菜单已创建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑菜单' : '新建菜单'" width="460px">
    <el-form label-width="88px" size="small">
      <el-form-item label="上级菜单">
        <el-tree-select
          v-model="parentId"
          :data="parentOptions"
          node-key="id"
          :props="{ label: 'title', children: 'children' }"
          check-strictly
          :render-after-expand="false"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="菜单名称">
        <el-input v-model="form.title" maxlength="32" placeholder="如：菜单管理" />
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="routePath" /></template>
        <el-input v-model="form.path" maxlength="128" placeholder="如：/settings/menus；目录型菜单可留空" />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :step="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="侧栏可见">
        <el-switch v-model="form.visible" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 120px">
          <el-option label="启用" value="active" />
          <el-option label="停用" value="disabled" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
