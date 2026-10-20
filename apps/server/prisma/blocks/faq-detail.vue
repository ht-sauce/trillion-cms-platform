<script setup lang="ts">
/**
 * FAQ 详情问答（原型 `.qa-head` + `.qa-body`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-qa-head / qa-body`，以及 faq/q001.html：
 *   .qa-head > span.cat + h2(问题)      —— 分类标签 + 问题（h2，H1 由 hero 承载）
 *   .qa-body > p*(答案段落)             —— 答案正文，段落间距 16px
 *
 * 数据字段：cat / question / paragraphs[]
 * 设计稿硬约束：
 * 1. 答案直接可读、不做折叠（09 §7.2 ②）；
 * 2. 答案按 ①②③ / 1. 2. 3. 分点拆段，每段一个要点；
 * 3. 不含疗效承诺，不做诊疗建议替代。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'faq-detail',
  name: 'FAQ 详情问答',
  hint: '分类标签 + 问题 + 答案段落（不折叠）',
  fields: [
    { key: 'cat', label: '分类标签', type: 'text' },
    { key: 'question', label: '问题', type: 'text', required: true },
    {
      key: 'paragraphs',
      label: '答案段落',
      type: 'list',
      required: true,
      item: { type: 'textarea' }
    }
  ]
})
</script>

<template>
  <div class="qa-head">
    <span v-if="data.cat" class="cat">{{ data.cat }}</span>
    <h2>{{ data.question }}</h2>
  </div>
  <div class="qa-body">
    <p v-for="(para, index) in data.paragraphs || []" :key="index">{{ para }}</p>
  </div>
</template>
