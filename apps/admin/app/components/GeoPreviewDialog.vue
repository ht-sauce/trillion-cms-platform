<script setup lang="ts">
/**
 * GEO 生成预览弹窗：只读展示「系统自动生成」与「实际会输出」两份结果
 * 用于在落盘前确认双模式（auto_append 追加 / override 覆盖）拼接后的最终产物
 * 纯计算接口，不落盘；打开时按入参现算
 */
import { geoApi, type GeoPreviewTarget } from '~/config/api'
import type { GeoDocMode } from '@trillion/shared'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId: string
  /** 预览目标 */
  target: GeoPreviewTarget
  pageId?: string
  mode?: GeoDocMode
  custom?: string
}>()

const auto = ref('')
const output = ref('')
const loading = ref(false)

watch(visible, async (open) => {
  if (!open || !props.siteId) return
  loading.value = true
  try {
    const result = await geoApi.preview({
      siteId: props.siteId,
      target: props.target,
      pageId: props.pageId,
      mode: props.mode,
      custom: props.custom
    })
    auto.value = result.auto
    output.value = result.output
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-dialog v-model="visible" :title="`GEO 预览 · ${target}`" width="760px">
    <div v-loading="loading" class="geo-preview">
      <div class="block">
        <p class="label">系统自动生成</p>
        <el-input :model-value="auto" type="textarea" :rows="8" readonly class="code-input" />
      </div>
      <div class="block">
        <p class="label">
          <TermHint term="geoDocMode" /> · 实际会输出（{{ mode === 'override' ? '全量覆盖' : '自动 + 追加' }}）
        </p>
        <el-input :model-value="output" type="textarea" :rows="8" readonly class="code-input" />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.geo-preview {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.code-input :deep(textarea) {
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  line-height: 1.6;
}
</style>
