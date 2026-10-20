<script setup lang="ts">
/**
 * 数据条（原型 `.stats` / `.stat`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-stats / stat`：
 *   .stats(.light .cN) > .stat > .n(数值 + small 单位) + .l(说明)
 *
 * 设计稿硬约束：
 * 1. 每个数字必须有出处 —— source 必填，写明统计口径与统计日期，无出处的数字宁可不放；
 * 2. 深色区（hero 内）用 dark 变体，浅色区用 light 变体，不可混用；
 * 3. 数字用等宽字形 + tabular-nums，避免抓取时被读作近似值。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'stat-bar',
  name: '数据条',
  hint: '2~8 组关键数字，须标注统计口径与统计日期',
  fields: [
    {
      key: 'items',
      label: '数据项',
      type: 'list',
      hint: '2~8 项，首页为 8 项（4 列 2 行）',
      item: {
        type: 'group',
        fields: [
          { key: 'n', label: '数值', type: 'number' },
          { key: 'unit', label: '单位', type: 'text', hint: '名 / 台 / 个 / 年 / 例 / 人次 / ㎡' },
          { key: 'label', label: '指标名', type: 'text' }
        ]
      }
    },
    {
      key: 'variant',
      label: '配色',
      type: 'select',
      options: ['dark', 'light'],
      required: true,
      hint: '这一块所在区域是深色背景选 dark，浅色背景选 light'
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['2', '3', '4'],
      hint: '默认 4'
    },
    {
      key: 'source',
      label: '统计口径与日期',
      type: 'text',
      required: true,
      hint: '如「截至 2026-06-30 院内人事在册口径」'
    }
  ]
})
</script>

<template>
  <div
    class="stats"
    :class="data.variant === 'light' ? 'light' : ''"
    :style="{ gridTemplateColumns: `repeat(${data.columns || 4},1fr)` }"
  >
    <div v-for="(item, index) in data.items || []" :key="index" class="stat">
      <div class="n">
        {{ item.n }}<small v-if="item.unit">{{ item.unit }}</small>
      </div>
      <div class="l">{{ item.label }}</div>
    </div>
  </div>
  <p v-if="data.source" class="stats-src">统计口径：{{ data.source }}</p>
</template>

<style>
.stats-src {
  max-width: var(--wrap);
  margin: 10px auto 0;
  padding: 0 24px;
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.7;
}
</style>
