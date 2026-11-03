<script setup lang="ts">
/**
 * 行业分组弹窗（新建 / 编辑）
 * 行业分组是 /products 列表页的分组结构：名称 → 分组标题，介绍 → 分组说明，
 * 更多文案 → 分组头的 moreLabel。保存后服务端重算列表页分组并触发发布。
 */
import { ElMessage } from 'element-plus'
import { catalogApi, type ProductIndustryItem } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId?: string
  /** 编辑对象；null 表示新建 */
  industry: ProductIndustryItem | null
}>()
const emit = defineEmits<{ saved: [] }>()

const { loading: saving, run } = useLoading()

const form = reactive({
  name: '',
  desc: '',
  moreLabel: '',
  sort: 0
})

const editing = computed(() => props.industry)

watch(visible, (open) => {
  if (!open) return
  form.name = props.industry?.name ?? ''
  form.desc = props.industry?.desc ?? ''
  form.moreLabel = props.industry?.moreLabel ?? ''
  form.sort = props.industry?.sort ?? 0
})

const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入分组名称')
    return
  }

  const payload = {
    name: form.name.trim(),
    desc: form.desc.trim(),
    moreLabel: form.moreLabel.trim(),
    sort: form.sort
  }

  return run(async () => {
    if (editing.value) {
      await catalogApi.updateIndustry(editing.value.id, payload)
    } else {
      await catalogApi.createIndustry({ siteId: props.siteId!, ...payload })
    }
    ElMessage.success(editing.value ? '已保存，站点正在重新构建' : '已创建，站点正在重新构建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? '编辑行业分组' : '新建行业分组'"
    width="560px"
    :close-on-click-modal="false"
  >
    <el-form label-width="96px" size="small">
      <el-form-item label="分组名称" required>
        <el-input v-model="form.name" maxlength="40" placeholder="如 食品饮料（/products 页分组标题）" />
      </el-form-item>
      <el-form-item label="分组说明">
        <el-input
          v-model="form.desc"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="这组产品解决的工况问题（分组副标题）"
        />
      </el-form-item>
      <el-form-item label="更多文案">
        <el-input v-model="form.moreLabel" maxlength="40" placeholder="分组头右侧链接文案，留空则不显示" />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :max="999" size="small" controls-position="right" />
        <span class="c-mute sort-hint">升序，数字小的分组排在前面</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.sort-hint {
  margin-left: $sp-1;
  font-size: 12px;
}
</style>
