<script setup lang="ts">
/**
 * 玻璃信息卡（原型 `.napcard` 键值化的单卡形态）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型无独立「单卡 + 徽标」类，故复用 `.napcard`（`.lb + b + p`）并追加
 * 一个 `.badge`（theme-b.css 已有徽标样式）承载右上角状态。
 *
 * 数据字段：title / badge / rows[{k, v, sub}]
 * 设计稿硬约束：只放可核验事实，一行一个键值，不做营销话术。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'glass-card',
  name: '玻璃信息卡',
  hint: '键值行事实卡，常用于执业信息 / 记录信息',
  fields: [
    { key: 'title', label: '卡标题', type: 'text', required: true, hint: '如「就诊信息」' },
    { key: 'badge', label: '右上角徽标', type: 'text', hint: '如「已脱敏」' },
    {
      key: 'rows',
      label: '键值行',
      type: 'list',
      hint: '每行一个事实',
      item: {
        type: 'group',
        fields: [
          { key: 'k', label: '项名', type: 'text' },
          { key: 'v', label: '值', type: 'text' },
          { key: 'sub', label: '副说明', type: 'text' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="napcard">
    <div class="lb">
      {{ data.title }}<span v-if="data.badge" class="badge info">{{ data.badge }}</span>
    </div>
    <template v-for="(row, index) in data.rows || []" :key="index">
      <b>{{ row.k }}</b>
      <p>
        {{ row.v }}<small v-if="row.sub"> · {{ row.sub }}</small>
      </p>
    </template>
  </div>
</template>

<style>
/* 卡标题行右侧徽标与原型 .badge 对齐（仅布局，视觉由 theme-b.css 承担） */
.napcard .lb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
</style>
