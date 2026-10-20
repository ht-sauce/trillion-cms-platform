<script setup lang="ts">
/**
 * 提示条 / 合规说明条（原型 `.notice` / `.notice.green` / `.cmpl`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-notice` / `blk-cmpl`：
 *   .notice(.green) > b + text      —— 提示条（浅底 + 左侧色条）
 *   .cmpl           > b + text      —— 合规说明条（浅灰底，出现频率最高）
 *
 * 数据字段：variant（info | green | warning | compliance）/ text
 *
 * 标记约定：text 里用 **双星** 包裹需加粗的前缀（如「回答口径说明：」），
 * 与原型写法一致；`[[方括号]]` 包裹等宽高亮（电话/编号）。
 *
 * 设计稿硬约束：`.cmpl` 为合规红线内容，建议固化进模板，不允许运营改写（09 §7.2）。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const bodyHtml = computed(() => {
  const raw = props.data?.text
  if (typeof raw !== 'string') return ''
  return escapeHtml(raw.replace(/\n/g, '<br>'))
    .replace(/\[\[(.+?)\]\]/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
})

/**
 * 原型只有三种视觉形态（theme-b.css / site.css）：
 *   `.notice`（琥珀浅底，警示/注意）· `.notice.green`（青绿浅底，正向）· `.cmpl`（灰蓝浅底，合规声明）
 * 故 info / compliance 归到 `.cmpl`，warning 归到 `.notice`，green 归到 `.notice.green`。
 */
const cls = computed(() => {
  const v = props.data?.variant
  if (v === 'green') return 'notice green'
  if (v === 'warning') return 'notice'
  return 'cmpl'
})

defineBlock({
  key: 'notice',
  name: '提示条 / 合规说明条',
  hint: '浅色底的提示横条，常用于注意事项、温馨提示或合规声明',
  fields: [
    {
      key: 'variant',
      label: '样式',
      type: 'select',
      options: ['info', 'green', 'warning', 'compliance'],
      required: true,
      hint: 'info=普通提示，green=正向确认，warning=警示提醒，compliance=合规声明'
    },
    {
      key: 'text',
      label: '正文',
      type: 'textarea',
      required: true,
      hint: '提示内容；**文字** 会加粗显示，[[文字]] 会高亮显示'
    }
  ]
})
</script>

<template>
  <div :class="cls" v-html="bodyHtml" />
</template>
