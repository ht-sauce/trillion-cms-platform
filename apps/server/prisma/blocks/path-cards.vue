<script setup lang="ts">
/**
 * 编号路径卡（原型 `.grid-N` + `.pcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.pcard`）：
 *   .grid-N > .pcard > (span.no + h4 + p + ul > li* + span.go)
 *   编号为深色底青绿字的方形标签。
 *
 * 设计稿硬约束：
 * 1. 编号路径是有序流程，整块用语义化顺序容器（原型用 div，此处保持 div + ol 语义在 PageRender 层不做额外约束）；
 * 2. `bullets` 为「这一步能了解什么」的要点，每条自包含，不写疗效与费用承诺。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'path-cards',
  name: '编号路径卡',
  hint: '有序路径入口卡，编号 01/02/03',
  fields: [
    {
      key: 'items',
      label: '路径卡',
      type: 'list',
      hint: '2~4 张',
      item: {
        type: 'group',
        fields: [
          { key: 'no', label: '编号', type: 'text', hint: '01 / 02 / 03' },
          { key: 'title', label: '标题', type: 'text' },
          { key: 'desc', label: '说明', type: 'text' },
          {
            key: 'bullets',
            label: '要点',
            type: 'list',
            hint: '3 条左右，每条自包含',
            item: { type: 'text' }
          },
          { key: 'href', label: '详情链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid-3">
    <NuxtLink v-for="item in data.items || []" :key="item.no || item.title" class="pcard" :to="item.href || '#'">
      <span v-if="item.no" class="no">{{ item.no }}</span>
      <h4>{{ item.title }}</h4>
      <p v-if="item.desc">{{ item.desc }}</p>
      <ul v-if="item.bullets?.length">
        <li v-for="bullet in item.bullets" :key="bullet">{{ bullet }}</li>
      </ul>
      <span class="go">了解{{ item.title }} →</span>
    </NuxtLink>
  </div>
</template>
