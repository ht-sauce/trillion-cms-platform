<script setup lang="ts">
/**
 * 角色表单弹窗（新建 / 编辑角色）
 * 规范：弹窗一律独立组件，父页面只用 v-model 控制显隐、监听 saved 刷新数据
 * 内置角色（builtin）：标识与状态由服务端保护，表单同步禁用避免误操作
 */
import { ElMessage } from 'element-plus'
import { rolesApi, type RoleItem, type RolePayload, type RoleStatus } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 编辑对象；null 表示新建 */
  role: RoleItem | null
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const form = reactive({
  code: '',
  name: '',
  description: '',
  platform: false,
  status: 'active' as RoleStatus,
  sort: 0
})

const editingId = computed(() => props.role?.id ?? null)
const builtin = computed(() => Boolean(props.role?.builtin))

/** 每次打开时重置并按传入值回显 */
watch(visible, (open) => {
  if (!open) return
  const role = props.role
  form.code = role?.code ?? ''
  form.name = role?.name ?? ''
  form.description = role?.description ?? ''
  form.platform = role?.platform ?? false
  form.status = role?.status ?? 'active'
  form.sort = role?.sort ?? 0
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning('请填写角色标识与名称')
    return
  }

  const payload: RolePayload = {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    platform: form.platform,
    status: form.status,
    sort: Number(form.sort) || 0
  }

  return run(async () => {
    if (editingId.value) await rolesApi.update(editingId.value, payload)
    else await rolesApi.create(payload)
    ElMessage.success(editingId.value ? '角色已更新（相关用户需重新登录生效）' : '角色已创建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑角色' : '新建角色'" width="460px">
    <el-form label-width="88px" size="small">
      <el-form-item label="角色标识">
        <el-input v-model="form.code" maxlength="32" :disabled="builtin" placeholder="如：ops_admin" />
      </el-form-item>
      <el-form-item label="角色名称">
        <el-input v-model="form.name" maxlength="32" placeholder="如：运营管理员" />
      </el-form-item>
      <el-form-item label="角色说明">
        <el-input v-model="form.description" maxlength="255" placeholder="该角色的职责范围" />
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="platformRole" /></template>
        <el-switch v-model="form.platform" />
        <span class="hint">平台级角色可执行建站、菜单/角色/用户维护等操作</span>
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :step="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status" :disabled="builtin" style="width: 120px">
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

<style scoped lang="scss">
.hint {
  margin-left: $sp-1;
  color: $c-text-faint;
  font-size: $font-size-xs;
}
</style>
