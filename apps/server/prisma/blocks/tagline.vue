<script setup lang="ts">
/**
 * 单病种标签行（原型 `.tagline`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-tagline`：
 *   .tagline > span*（12.5px 小标签，圆角）
 *
 * 与 hero-dark 的 `.chips` 区别：chips 在深色 Hero 内（浅色描边），
 * tagline 在浅色正文内（浅底描边小尺寸），两者视觉环境不同，不合并。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'tagline',
  name: '单病种标签行',
  hint: '一排小号浅底标签，用于罗列病种、特色服务等关键词',
  fields: [{ key: 'items', label: '标签', type: 'list', item: { type: 'text' } }]
})
</script>

<template>
  <div v-if="data.items?.length" class="tagline">
    <span v-for="item in data.items" :key="item">{{ item }}</span>
  </div>
</template>
