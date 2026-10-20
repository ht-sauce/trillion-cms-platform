<script setup lang="ts">
/**
 * 侧栏资讯列表（原型 `.newslist`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-newslist`：
 *   .newslist > a*(span(日期，等宽) + 标题文本)
 *
 * 与 post-list 的区别：post-list 是资讯列表页主体（含摘要），
 * side-news 是详情页侧栏的紧凑列表（只有日期 + 标题）。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'side-news',
  name: '侧栏资讯',
  hint: '侧边栏的资讯 / 公告列表，显示日期和标题',
  fields: [
    {
      key: 'items',
      label: '资讯条目',
      type: 'list',
      required: true,
      item: {
        type: 'group',
        fields: [
          { key: 'date', label: '日期', type: 'text', hint: '如「2025-09-20」' },
          { key: 'title', label: '标题', type: 'text' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="newslist">
    <NuxtLink v-for="item in data.items || []" :key="item.title" :to="item.href || '#'">
      <span v-if="item.date">{{ item.date }}</span
      >{{ item.title }}
    </NuxtLink>
  </div>
</template>
