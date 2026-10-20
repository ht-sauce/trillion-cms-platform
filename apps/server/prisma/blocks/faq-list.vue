<script setup lang="ts">
/**
 * FAQ 问答列表（原型 `.faq` + `.q`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM（01-index.html FAQ 区块）：
 *   .faq > .q*(div.t > b(Q) + span(问题) + div.a(答案))
 *
 * 设计稿硬约束（09 §7.2 ②）：答案直接可读、不做折叠。
 * 与 faq-index 的区别：faq-index 带序号/箭头并链到详情页，faq-list 是就地展开的简答。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'faq-list',
  name: 'FAQ 问答列表',
  hint: '就地展开的问答（不折叠）',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '会作为这组问答的大标题显示' },
    {
      key: 'category',
      label: '分类标签',
      type: 'text',
      hint: '同一页放多组 FAQ 时用于分组，如「就诊流程」；单组可留空'
    },
    {
      key: 'items',
      label: '问答',
      type: 'list',
      hint: '答案直接展示，不折叠',
      item: {
        type: 'group',
        fields: [
          { key: 'q', label: '问题', type: 'textarea', required: true },
          { key: 'a', label: '答案', type: 'textarea', required: true, hint: '可直接摘取的完整答案' }
        ]
      }
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['1', '2'],
      default: '2',
      hint: '答案较长时选 1 列，阅读更轻松'
    }
  ]
})
</script>

<template>
  <h2 v-if="data.title" class="faq-list-title">
    {{ data.title }}
    <span v-if="data.category" class="faq-list-cat">{{ data.category }}</span>
  </h2>

  <div class="faq" :class="{ one: String(data.columns ?? '2') === '1' }">
    <div v-for="(item, index) in data.items || []" :key="index" class="q">
      <div class="t">
        <b>Q</b><span>{{ item.q }}</span>
      </div>
      <div class="a">{{ item.a }}</div>
    </div>
  </div>
</template>

<style>
/* 原型 FAQ 标题通常在 .sec-head 里；这里补独立标题的最小样式 */
.faq-list-title {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.faq-list-cat {
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 99px;
  background: var(--teal-lt);
  border: 1px solid #bfe9e3;
  color: #0b5a54;
}
</style>
