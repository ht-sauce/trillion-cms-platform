<script setup lang="ts">
/**
 * 相关问答列表（原型 `.relqa`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-relqa`：
 *   .relqa > a*(i(序号) + text)
 *   用于 FAQ 详情页侧栏，同分类内抽取。
 *
 * 数据字段：items[{idx, text, href}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'related-faq',
  name: '相关问答列表',
  hint: 'FAQ 详情页侧栏相关问答（最多 8 条）',
  fields: [
    {
      key: 'items',
      label: '问答',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'idx', label: '序号', type: 'text' },
          { key: 'text', label: '问题', type: 'text' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="relqa">
    <NuxtLink v-for="item in data.items || []" :key="item.href || item.text" :to="item.href || '#'">
      <i>{{ item.idx }}</i
      >{{ item.text }}
    </NuxtLink>
  </div>
</template>
