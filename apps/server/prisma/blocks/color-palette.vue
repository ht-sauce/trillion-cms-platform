<script setup lang="ts">
/**
 * 色卡（地坪面层配色）
 *
 * 为什么需要：聚氨酯 / 环氧地坪的色号是选型的一部分，业主常常拿色卡和水磨石、
 * 瓷砖做对比；纯文字列表无法表达「这一色到底什么样」，所以给色块。
 *
 * 色值口径：`hex` 必须是**实际供货色卡**上的值，由供应商提供；禁止凭印象挑色。
 * 渲染上色块用内联 `background`（数据驱动的运行时值，不是样式里的颜色字面量），
 * 色值与名称同时以文本输出，色觉障碍用户与机器抽取都能读到。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'color-palette',
  name: '色卡',
  hint: '地坪面层配色卡：色块 + 色名 + 色值，须取自实际供货色卡',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '如 标准色卡' },
    {
      key: 'swatches',
      label: '色块',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'name', label: '色名', type: 'text', required: true, hint: '如 浅灰 / 中黄' },
          { key: 'hex', label: '色值', type: 'text', required: true, hint: '如 #C9CDD4，必须取自供货色卡' },
          { key: 'code', label: '色号', type: 'text', hint: '供应商色号，如 RAL 7035' }
        ]
      }
    },
    { key: 'note', label: '注释', type: 'textarea', hint: '如「屏幕显示存在色差，实际颜色以实物色卡为准」' }
  ]
})
</script>

<template>
  <div class="cp">
    <div v-if="data.title" class="cp-title">{{ data.title }}</div>
    <div class="cp-swatches">
      <div v-for="sw in data.swatches || []" :key="sw.name" class="cp-sw">
        <span class="chip" :style="{ background: sw.hex }" :aria-label="`${sw.name} ${sw.code || ''}`"></span>
        <span class="nm">{{ sw.name }}</span>
        <span v-if="sw.code" class="cd">{{ sw.code }}</span>
      </div>
    </div>
    <p v-if="data.note" class="cp-note">{{ data.note }}</p>
  </div>
</template>
