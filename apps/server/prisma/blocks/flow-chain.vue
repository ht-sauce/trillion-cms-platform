<script setup lang="ts">
/**
 * 就诊流程链（原型 `.flow`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-flow`：
 *   .flow > (i > b(圈号) + text) + em(→) + (i > b + text) …
 *   圆角小标签 + 箭头连接，自动换行。
 *
 * 数据字段：steps[{text}]
 * 序号 ①②③ 由组件按下标生成（原型用 ①..⑦）。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

defineBlock({
  key: 'flow-chain',
  name: '就诊流程链',
  hint: '圆角标签 + 箭头连接的有序流程',
  fields: [
    {
      key: 'steps',
      label: '步骤',
      type: 'list',
      hint: '3~8 步',
      item: {
        type: 'group',
        fields: [{ key: 'text', label: '文字', type: 'text' }]
      }
    }
  ]
})
</script>

<template>
  <div class="flow">
    <template v-for="(step, index) in data.steps || []" :key="index">
      <i
        ><b>{{ CIRCLED[index] || index + 1 }}</b> {{ step.text }}</i
      >
      <em v-if="index < (data.steps || []).length - 1">→</em>
    </template>
  </div>
</template>
