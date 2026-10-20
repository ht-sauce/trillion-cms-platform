<script setup lang="ts">
/**
 * 路线行卡（原型 `.rt` + `.rrow`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-rt / rrow`：
 *   .rt > .rrow*(div.rh > (div.ric + b) + p > code*)
 *   圆形图标 + 标题 + 路线说明（含 code 高亮）。
 *
 * 数据字段：items[{icon, title, parts[{text, highlight}]}]
 * 设计稿硬约束：路线信息为客观出行指引，需与实地一致。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'route-rows',
  name: '路线行卡',
  hint: '圆形图标 + 标题 + 路线说明（可高亮站点名）',
  fields: [
    {
      key: 'items',
      label: '路线',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'icon', label: '图标字', type: 'text', hint: '单字，如 地 / 公 / 车' },
          { key: 'title', label: '标题', type: 'text' },
          {
            key: 'parts',
            label: '说明片段',
            type: 'list',
            hint: '打开「高亮」开关的文字片段会突出显示（如站名、线路号）',
            item: {
              type: 'group',
              fields: [
                { key: 'text', label: '文字', type: 'text' },
                { key: 'highlight', label: '高亮', type: 'switch' }
              ]
            }
          }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="rt">
    <div v-for="item in data.items || []" :key="item.title" class="rrow">
      <div class="rh">
        <div class="ric">{{ item.icon }}</div>
        <b>{{ item.title }}</b>
      </div>
      <p>
        <template v-for="(part, index) in item.parts || []" :key="index">
          <code v-if="part.highlight">{{ part.text }}</code>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>
    </div>
  </div>
</template>
