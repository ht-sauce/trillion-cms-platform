<script setup lang="ts">
/**
 * 术语卡（原型 `.terms` + `.term`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-term / terms`：
 *   .terms > .term*(b(专业词) + p(通俗解释) + p > em(通俗说法：) + 引号句)
 *   2 列；左侧 3px 青绿描边为识别特征。
 *
 * 数据字段：cols / items[{term, plain, aiPhrase}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'term-cards',
  name: '术语卡',
  hint: '专业词 + 通俗解释 + 通俗说法（2 列）',
  fields: [
    { key: 'cols', label: '列数', type: 'select', options: ['2', '3'], default: '2' },
    {
      key: 'items',
      label: '术语',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'term', label: '专业词', type: 'text' },
          { key: 'plain', label: '通俗解释', type: 'textarea' },
          { key: 'aiPhrase', label: '通俗说法', type: 'text', hint: '带引号的口语句' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="terms">
    <div v-for="item in data.items || []" :key="item.term" class="term">
      <b>{{ item.term }}</b>
      <p>{{ item.plain }}</p>
      <p v-if="item.aiPhrase" style="margin-top: 6px"><em>通俗说法：</em>「{{ item.aiPhrase }}」</p>
    </div>
  </div>
</template>
