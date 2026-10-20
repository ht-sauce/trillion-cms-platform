<script setup lang="ts">
/**
 * 通用卡片网格（原型 `.grid-N` + `.tcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-tcard`：
 *   .grid-4|.grid-3 > .tcard > .ico + h4 + p + .v(卡脚，可含 span)
 *
 * 设计稿硬约束：
 * 1. columns 只允许 3 / 4，默认 3；4 列仅用于短文本（如初诊清单、更正机制）；
 * 2. footerLabel + footerValue 是卡脚的「可核验落点」（如「检查明细 共7项」），不是 CTA；
 * 3. icon 为单字/编号图标，纯装饰需 aria-hidden。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'feature-cards',
  name: '通用卡片网格',
  hint: '3 列 / 4 列图标卡片网格',
  fields: [
    {
      key: 'items',
      label: '卡片',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'icon', label: '图标字', type: 'text', hint: '单字或编号，如 01 / 无疗效承诺' },
          { key: 'title', label: '标题', type: 'text' },
          { key: 'desc', label: '说明', type: 'text' },
          { key: 'footerLabel', label: '卡脚标签', type: 'text', hint: '如「检查明细」' },
          { key: 'footerValue', label: '卡脚内容', type: 'text', hint: '如「共7项」' }
        ]
      }
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['3', '4'],
      default: '3',
      hint: '4 列仅用于短文本'
    }
  ]
})
</script>

<template>
  <div class="grid" :class="data.columns === '4' ? 'grid-4' : 'grid-3'">
    <div v-for="(item, index) in data.items || []" :key="index" class="tcard">
      <div v-if="item.icon" class="ico" aria-hidden="true">{{ item.icon }}</div>
      <h4>{{ item.title }}</h4>
      <p>{{ item.desc }}</p>
      <div v-if="item.footerLabel || item.footerValue" class="v">
        {{ item.footerLabel }} <span>{{ item.footerValue }}</span>
      </div>
    </div>
  </div>
</template>
