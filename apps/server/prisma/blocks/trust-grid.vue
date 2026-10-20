<script setup lang="ts">
/**
 * 信任四格（原型 `.grid-4` + `.tcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 * trust-grid 与 feature-cards 共用原型 `.tcard` 视觉，差别只在语义约定：
 * trust-grid 固定 4 列、固定「四类可核验事实」，卡脚 `.v` 为「可核验结论」。
 *
 * 原型 DOM：`.grid-4 > .tcard > .ico + h4 + p + .v`
 *
 * 设计稿硬约束：
 * 1. 固定 4 列（移动端 2 列），对应四类信任信息，不随意增减列数；
 * 2. value 为该格的「可核验结论」（如「许可证号 PDY1015…」），不是宣传语；
 * 3. icon 为单字图标（证 / 医 / 设 / 保），纯装饰需 aria-hidden。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'trust-grid',
  name: '信任四格',
  hint: '四类可核验事实：执业许可 / 医师团队 / 设备信息 / 医保政策',
  fields: [
    {
      key: 'items',
      label: '信任项',
      type: 'list',
      hint: '固定 4 项',
      item: {
        type: 'group',
        fields: [
          { key: 'icon', label: '图标字', type: 'text', hint: '单字，如 证 / 医 / 设 / 保' },
          { key: 'title', label: '标题', type: 'text' },
          { key: 'desc', label: '说明', type: 'text', hint: '一句话，写明可追溯来源' },
          { key: 'value', label: '可核验结论', type: 'text', hint: '如「许可证号 PDY1015…」' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid-4">
    <div v-for="(item, index) in data.items || []" :key="index" class="tcard">
      <div class="ico" aria-hidden="true">{{ item.icon }}</div>
      <h4>{{ item.title }}</h4>
      <p>{{ item.desc }}</p>
      <div v-if="item.value" class="v">{{ item.value }}</div>
    </div>
  </div>
</template>
