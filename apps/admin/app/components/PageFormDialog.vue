<script setup lang="ts">
/**
 * 页面表单弹窗（新建页面 / 编辑页面元信息）
 * 规范：弹窗独立成组件；父页面只管 v-model 显隐 + saved 刷新
 * 编辑时若页面已发布，slug 与所属目录由服务端锁定（400），这里把对应控件置灰并在提示中说明
 */
import { ElMessage } from 'element-plus'
import { editorApi } from '~/config/api'
import type { ContentTreeNode, PageKind } from '@trillion/shared'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 编辑对象；null 表示新建 */
  page: ContentTreeNode | null
  siteId: string
  /** 目录候选（channelId 选择器） */
  channels: { id: string; name: string; path: string }[]
  /** 新建时默认落在哪个目录 */
  defaultChannelId?: string | null
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const form = reactive({
  title: '',
  slug: '',
  channelId: null as string | null,
  kind: 'static' as PageKind,
  summary: ''
})

const editingId = computed(() => props.page?.id ?? null)
/** 已发布页面：slug 与所属目录不可变（服务端 400） */
const locked = computed(() => props.page?.badge === 'published')

watch(visible, (open) => {
  if (!open) return
  const page = props.page
  form.title = page?.name ?? ''
  form.slug = page?.slug ?? ''
  form.channelId = props.channels[0]?.id ?? props.defaultChannelId ?? null
  form.kind = page?.kind ?? 'static'
  form.summary = ''
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!form.title.trim()) {
    ElMessage.warning('请输入页面标题')
    return
  }
  const slug = form.slug.trim()
  if (!/^[a-z0-9-]+$/.test(slug)) {
    ElMessage.warning('URL 片段只能包含小写字母、数字与连字符')
    return
  }
  const channelId = form.channelId
  if (!channelId) {
    ElMessage.warning('请选择所属目录')
    return
  }

  return run(async () => {
    if (editingId.value) {
      await editorApi.updatePage(editingId.value, {
        title: form.title.trim(),
        kind: form.kind,
        summary: form.summary.trim() || undefined,
        ...(locked.value ? {} : { slug, channelId })
      })
      ElMessage.success('页面已更新')
    } else {
      await editorApi.createPage({
        siteId: props.siteId,
        channelId,
        title: form.title.trim(),
        slug,
        kind: form.kind,
        summary: form.summary.trim() || undefined
      })
      ElMessage.success('页面已创建')
    }
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editingId ? '编辑页面' : '新建页面'" width="520px">
    <el-form label-width="88px">
      <el-form-item label="页面标题">
        <el-input v-model="form.title" maxlength="128" placeholder="如：牙齿种植" />
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="urlSlug" /></template>
        <el-input v-model="form.slug" :disabled="locked" maxlength="128" placeholder="如：dental-implant" />
      </el-form-item>
      <el-form-item label="所属目录">
        <el-select v-model="form.channelId" :disabled="locked" style="width: 100%">
          <el-option v-for="item in channels" :key="item.id" :label="`${item.name}（${item.path}）`" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <template #label><TermHint term="pageKind" /></template>
        <el-select v-model="form.kind" style="width: 160px">
          <el-option label="静态页" value="static" />
          <el-option label="列表页" value="list" />
          <el-option label="详情页" value="detail" />
        </el-select>
      </el-form-item>
      <el-form-item label="摘要">
        <el-input
          v-model="form.summary"
          type="textarea"
          :rows="3"
          maxlength="512"
          placeholder="llms.txt 与 meta description 复用"
        />
      </el-form-item>
    </el-form>
    <p v-if="locked" class="tip">该页已发布：URL 片段与所属目录已锁定，如需改动请先回退产物再发布。</p>
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
