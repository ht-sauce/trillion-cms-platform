<script setup lang="ts">
/**
 * NAP 信息卡网格（原型 `.napgrid` + `.napcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-napcard / napgrid`：
 *   .napgrid > .napcard*(div.lb + b + p)
 *   3 列；NAP 是 GEO 核心实体数据。
 *
 * 数据字段：items[{label, value, note}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'nap-grid',
  name: '机构信息卡',
  hint: '机构名称、地址、电话等基础信息卡片；各平台对外信息必须与这里完全一致',
  fields: [
    {
      key: 'items',
      label: '信息项',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '标签', type: 'text', hint: '如「机构名称」「执业地址」' },
          { key: 'value', label: '主值', type: 'text' },
          { key: 'note', label: '补充说明', type: 'text', hint: '如「工商登记：…」' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="napgrid">
    <div v-for="item in data.items || []" :key="item.label" class="napcard">
      <div class="lb">{{ item.label }}</div>
      <b>{{ item.value }}</b>
      <p v-if="item.note">{{ item.note }}</p>
    </div>
  </div>
</template>
