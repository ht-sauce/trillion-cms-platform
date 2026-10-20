<script setup lang="ts">
/**
 * 目录表单弹窗（新建目录 / 重命名目录）
 * 规范：弹窗独立成组件；父页面只管 v-model 显隐 + saved 刷新
 * slug 改动会重建整棵子路径，已发布页面所在目录的 slug 由服务端拒绝（400），此处只做提示不预判
 */
import { ElMessage } from 'element-plus'
import { editorApi } from '~/config/api'
import type { ContentTreeNode } from '@trillion/shared'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 编辑对象；null 表示新建 */
  channel: ContentTreeNode | null
  siteId: string
  /** 新建时的上级目录 ID（null = 一级目录） */
  parentId?: string | null
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const form = reactive({
  name: '',
  slug: '',
  sort: 0
})

const editingId = computed(() => props.channel?.id ?? null)

watch(visible, (open) => {
  if (!open) return
  const channel = props.channel
  form.name = channel?.name ?? ''
  form.slug = channel?.slug ?? ''
  form.sort = channel?.sort ?? 0
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!form.name.trim()) {
    ElMessage.warning('请输入目录名称')
    return
  }
  const slug = form.slug.trim()
  if (!/^[a-z0-9-]+$/.test(slug)) {
    ElMessage.warning('URL 片段只能包含小写字母、数字与连字符')
    return
  }

  return run(async () => {
    if (editingId.value) {
      await editorApi.updateChannel(editingId.value, {
        name: form.name.trim(),
        slug,
        sort: Number(form.sort) || 0
      })
      ElMessage.success('目录已更新')
    } else {
      await editorApi.createChannel({
        siteId: props.siteId,
        parentId: props.parentId ?? null,
        name: form.name.trim(),
        slug,
        sort: Number(form.sort) || 0
      })
      ElMessage.success('目录已创建')
    }
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑目录' : '新建目录'" width="460px">
    <el-form label-width="88px">
      <el-form-item label="目录名称">
        <el-input v-model="form.name" maxlength="64" placeholder="如：诊疗项目" />
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="urlSlug" /></template>
        <el-input v-model="form.slug" maxlength="64" placeholder="如：treatments" />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :step="1" controls-position="right" />
      </el-form-item>
    </el-form>
    <p class="tip">提示：目录下存在已发布页面时，URL 片段不允许修改（服务端会拒绝并返回 400）。</p>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.tip {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-faint;
}
</style>
