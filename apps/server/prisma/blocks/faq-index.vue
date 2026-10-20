<script setup lang="ts">
/**
 * FAQ 问答条目列表（原型 `.qa` + `a.qa-link` + `.ans`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-qa / qa-link / qidx / ans`：
 *   article.qa > (a.qa-link > span.qidx + span.qt + i.arw) + div.ans
 *
 * 数据字段：items[{idx, q, a, href}]
 * 设计稿硬约束（09 §7.2 ②）：答案直接可读、不做折叠。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'faq-index',
  name: 'FAQ 问答条目列表',
  hint: '序号 + 问题 + 箭头，下方为答案摘要（不折叠）',
  fields: [
    {
      key: 'items',
      label: '问答',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'idx', label: '序号', type: 'text' },
          { key: 'q', label: '问题', type: 'text' },
          { key: 'a', label: '答案摘要', type: 'textarea' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div>
    <article v-for="item in data.items || []" :key="item.q" class="qa">
      <NuxtLink class="qa-link" :to="item.href || '#'">
        <span class="qidx">{{ item.idx }}</span>
        <span class="qt">{{ item.q }}</span>
        <i class="arw" aria-hidden="true"></i>
      </NuxtLink>
      <div class="ans">{{ item.a }}</div>
    </article>
  </div>
</template>
