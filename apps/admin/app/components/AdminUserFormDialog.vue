<script setup lang="ts">
/**
 * 后台用户表单弹窗（新建 / 编辑用户 + 角色绑定 + 站点授权）
 * 规范：弹窗一律独立组件，父页面只用 v-model 控制显隐、监听 saved 刷新数据
 * 站点授权仅对非平台级角色有意义（平台级角色默认可访问全部站点）
 */
import { ElMessage } from 'element-plus'
import { adminUsersApi, type AdminUserItem, type AdminUserPayload, type RoleItem } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 编辑对象；null 表示新建 */
  user: AdminUserItem | null
  /** 可选角色（父页面加载后传入） */
  roles: RoleItem[]
  /** 可选站点（父页面加载后传入） */
  sites: { id: string; name: string }[]
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const form = reactive({
  username: '',
  password: '',
  displayName: '',
  roleId: undefined as string | undefined,
  siteIds: [] as string[],
  enabled: true
})

const editingId = computed(() => props.user?.id ?? null)
/** 当前所选角色是否平台级（决定站点授权是否可用） */
const rolePlatform = computed(() => props.roles.find((item) => item.id === form.roleId)?.platform ?? false)

/** 每次打开时重置并按传入值回显（密码留空表示不修改） */
watch(visible, (open) => {
  if (!open) return
  const user = props.user
  form.username = user?.username ?? ''
  form.password = ''
  form.displayName = user?.displayName ?? ''
  form.roleId = user?.roleId ?? props.roles[0]?.id
  form.siteIds = [...(user?.siteIds ?? [])]
  form.enabled = user?.enabled ?? true
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!form.roleId) {
    ElMessage.warning('请选择绑定角色')
    return
  }
  if (!editingId.value && !form.username.trim()) {
    ElMessage.warning('请填写登录账号')
    return
  }
  if (form.password && form.password.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }
  if (!editingId.value && !form.password) {
    ElMessage.warning('请设置初始密码')
    return
  }

  const payload: AdminUserPayload = {
    displayName: form.displayName.trim(),
    roleId: form.roleId,
    siteIds: form.siteIds,
    enabled: form.enabled
  }
  if (form.password) payload.password = form.password
  if (!editingId.value) payload.username = form.username.trim()

  return run(async () => {
    if (editingId.value) await adminUsersApi.update(editingId.value, payload)
    else await adminUsersApi.create(payload)
    ElMessage.success(editingId.value ? '用户已更新（角色变更需该用户重新登录生效）' : '用户已创建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑用户' : '新建用户'" width="480px">
    <el-form label-width="88px" size="small">
      <el-form-item label="登录账号">
        <el-input v-model="form.username" maxlength="32" :disabled="Boolean(editingId)" placeholder="如：editor01" />
      </el-form-item>
      <el-form-item label="登录密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          maxlength="64"
          :placeholder="editingId ? '留空表示不修改' : '至少 6 位'"
        />
      </el-form-item>
      <el-form-item label="展示名称">
        <el-input v-model="form.displayName" maxlength="32" placeholder="如：内容编辑" />
      </el-form-item>
      <el-form-item label="绑定角色">
        <el-select v-model="form.roleId" style="width: 100%">
          <el-option v-for="role in roles" :key="role.id" :label="`${role.name}（${role.code}）`" :value="role.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="siteGrant" /></template>
        <el-select
          v-model="form.siteIds"
          multiple
          :disabled="rolePlatform"
          :placeholder="rolePlatform ? '平台级角色可访问全部站点' : '选择可管理的站点'"
          style="width: 100%"
        >
          <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
