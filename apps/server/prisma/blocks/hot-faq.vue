<script setup lang="ts">
/**
 * 热门问答速览（原型 `.hotlist` + `a.hotq`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-hotq / hotlist`：
 *   .hotlist > a.hotq*(b(问题) + span(答案首句))
 *
 * 数据字段：items[{q, a, href}]
 * 设计稿硬约束：FAQ 答案直接可读、不做折叠（09 §7.2 ②）。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'hot-faq',
  name: '热门问答速览',
  hint: '2 列热门问答：问题 + 答案首句',
  fields: [
    {
      key: 'items',
      label: '问答',
      type: 'list',
      item: {
        type: 'group',
        fields: [
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
  <div class="hotlist">
    <NuxtLink v-for="item in data.items || []" :key="item.q" class="hotq" :to="item.href || '#'">
      <b>{{ item.q }}</b>
      <span>{{ item.a }}</span>
    </NuxtLink>
  </div>
</template>
