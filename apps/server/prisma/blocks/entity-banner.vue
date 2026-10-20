<script setup lang="ts">
/**
 * 实体消歧条（原型 `.entity-bar`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-entity-bar`：
 *   .entity-bar > b(左标签) + div(右侧说明，可含 code 高亮)
 *   仅首页 / 就诊指南 使用，用于处理「同一实体多种表述」的消歧。
 *
 * 设计稿硬约束：只声明主体唯一性与可核对性，不做疗效与排名承诺。
 *
 * 标记约定：说明正文里用 [[方括号]] 包裹需要等宽高亮的内容（信用代码 / 许可证号），
 * 用 **双星** 包裹需要加粗强调的内容 —— 对齐原型既有写法。
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
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
})

defineBlock({
  key: 'entity-banner',
  name: '实体消歧条',
  hint: '深色横条，用于声明「本院只有一个执业主体」或统一地址写法，避免各平台说法不一',
  fields: [
    { key: 'label', label: '左标签', type: 'text', hint: '如「主体唯一：」「地址口径说明」' },
    {
      key: 'text',
      label: '说明正文',
      type: 'textarea',
      required: true,
      hint: '用 [[方括号]] 包住要高亮的内容（如统一社会信用代码、许可证号），**文字** 会加粗强调'
    }
  ]
})
</script>

<template>
  <div class="entity-bar">
    <b>{{ data.label || '主体唯一：' }}</b>
    <div v-html="bodyHtml" />
  </div>
</template>
