<script setup lang="ts">
/**
 * 文章元信息条（原型 `.artmeta`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-artmeta / artbody`：
 *   .artmeta > time(日期)
 *
 * 数据字段：date（新闻去分类，不再有 category / ptag）
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'article-meta',
  name: '文章元信息条',
  hint: '发布日期',
  fields: [{ key: 'date', label: '日期', type: 'text', hint: 'YYYY-MM-DD' }]
})
</script>

<template>
  <div class="artmeta">
    <time v-if="data.date">{{ data.date }}</time>
  </div>
</template>
