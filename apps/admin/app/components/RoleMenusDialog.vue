<script setup lang="ts">
/**
 * 角色菜单授权弹窗（角色 → 菜单）
 * 规范：弹窗一律独立组件；勾选子菜单会自动包含其上级目录（服务端保存时同样补全祖先）
 */
import { ElMessage } from 'element-plus'
import { menusApi, rolesApi, type MenuNode, type RoleItem } from '~/config/api'
import { useAuthStore } from '~/stores/auth'
import { useMenuStore } from '~/stores/menu'
import { buildMenuTree } from '~/utils/menu-tree'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 待授权的角色 */
  role: RoleItem | null
}>()
const emit = defineEmits<{ saved: [] }>()

const auth = useAuthStore()
const menuStore = useMenuStore()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

/** 弹窗打开时拉取菜单树的加载态（与提交态相互独立） */
const loading = ref(false)
const menuTree = ref<MenuNode[]>([])
const treeRef = ref<{ setCheckedKeys: (keys: string[]) => void; getCheckedKeys: () => string[] }>()

/** 每次打开时加载菜单树并回显该角色已授权的菜单 */
watch(visible, async (open) => {
  if (!open || !props.role) return
  loading.value = true
  try {
    if (!menuTree.value.length) {
      const result = await menusApi.list()
      menuTree.value = buildMenuTree(result.list)
    }
    await nextTick()
    treeRef.value?.setCheckedKeys(props.role.menuIds)
  } finally {
    loading.value = false
  }
})

/** 保存授权（防抖在外、loading 在内） */
const submit = debounce(() => {
  const role = props.role
  if (!role) return
  const menuIds = treeRef.value?.getCheckedKeys() || []

  return run(async () => {
    await rolesApi.saveMenus(role.id, menuIds)
    ElMessage.success('菜单授权已保存')
    visible.value = false
    emit('saved')
    /** 改的是当前账号的角色时，侧栏立即刷新（角色名等 JWT 内信息需重新登录才更新） */
    if (role.id === auth.user?.roleId) await menuStore.load(true)
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="`菜单授权 · ${role?.name || ''}`" width="420px">
    <p class="hint">勾选该角色登录后可见的菜单；勾选子菜单会自动包含其上级目录。</p>
    <div v-loading="loading" class="tree-wrap">
      <el-tree
        ref="treeRef"
        :data="menuTree"
        node-key="id"
        :props="{ label: 'title', children: 'children' }"
        show-checkbox
        check-strictly
        default-expand-all
      />
    </div>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.hint {
  margin: 0 0 4px;
  color: $c-text-faint;
  font-size: $font-size-xs;
}

.tree-wrap {
  max-height: 320px;
  overflow: auto;
  padding: 4px;
  border: 1px solid $c-border-soft;
  border-radius: $radius-md;
}
</style>
