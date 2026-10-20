<script setup lang="ts">
/**
 * 定位卡组（原型 `.grid-2` / `.grid-3` + `.vcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 01-index.html / 11-services.html 的定位陈述区：
 *   div.grid-2(或 grid-3)[style align-items:stretch] > .vcard* > (div.k + div.v)
 *   整行卡：.vcard[style grid-column:1/-1]
 *
 * 用途：机构身份定位 / 诊疗范围定位 / 服务特色定位等**定性陈述**，
 * 与 stat-bar（定量数据）互补。只写客观定位，不写疗效承诺。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'vcard-grid',
  name: '陈述卡组',
  hint: '「小标题 + 正文」式卡片，用于表达机构定位、服务原则等陈述内容；某张卡可占满整行',
  fields: [
    { key: 'columns', label: '列数', type: 'select', options: ['2', '3'], default: '2' },
    {
      key: 'items',
      label: '卡片',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'k', label: '小标', type: 'text', hint: '如「机构身份定位」' },
          { key: 'v', label: '正文', type: 'textarea', required: true },
          { key: 'full', label: '占满整行', type: 'switch' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid" :class="`grid-${data.columns || 2}`" style="align-items: stretch">
    <div
      v-for="card in data.items || []"
      :key="card.k"
      class="vcard"
      :style="card.full ? { gridColumn: '1 / -1' } : undefined"
    >
      <div class="k">{{ card.k }}</div>
      <div class="v">{{ card.v }}</div>
    </div>
  </div>
</template>
