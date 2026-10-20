<script setup lang="ts">
/**
 * 新建会员弹窗（站点会员管理）
 * 规范：弹窗一律独立组件，父页面只通过 v-model 控制显隐、监听 saved 刷新列表
 */
import { ElMessage } from 'element-plus'
import { membersApi } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 会员归属站点（父页面当前选中的站点） */
  siteId?: string
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const form = reactive({ username: '', password: '', nickname: '' })

/** 每次打开重置表单，避免残留上一次输入 */
watch(visible, (open) => {
  if (!open) return
  form.username = ''
  form.password = ''
  form.nickname = ''
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.username.trim()) {
    ElMessage.warning('请输入会员账号')
    return
  }
  if (form.password.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }

  return run(async () => {
    await membersApi.create({
      siteId: props.siteId!,
      username: form.username.trim(),
      password: form.password,
      nickname: form.nickname.trim() || undefined
    })
    ElMessage.success('会员已创建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" title="新建会员" width="380px">
    <el-form label-width="60px" size="small">
      <el-form-item label="账号">
        <el-input v-model="form.username" maxlength="32" placeholder="会员登录账号" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password maxlength="64" placeholder="至少 6 位" />
      </el-form-item>
      <el-form-item label="昵称">
        <el-input v-model="form.nickname" maxlength="32" placeholder="可选" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
