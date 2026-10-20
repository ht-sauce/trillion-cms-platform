<script setup lang="ts">
/**
 * 分类锚点条（原型 `.faq-cats`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-faq-cats（锚点条）`：
 *   .faq-cats > a*(分类名 + em(条数徽标))
 *
 * 数据字段：items[{label, href, count}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'anchor-bar',
  name: '分类锚点条',
  hint: '带条数徽标的分类锚点，点击跳分类',
  fields: [
    {
      key: 'items',
      label: '锚点',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '分类名', type: 'text' },
          { key: 'href', label: '链接', type: 'url' },
          { key: 'count', label: '条数', type: 'number' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="faq-cats">
    <NuxtLink v-for="item in data.items || []" :key="item.label" :to="item.href || '#'">
      {{ item.label }}<em v-if="item.count !== undefined && item.count !== null">{{ item.count }}</em>
    </NuxtLink>
  </div>
</template>
