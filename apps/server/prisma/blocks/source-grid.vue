<script setup lang="ts">
/**
 * 官方信源卡网格（原型 `.srcgrid` + `.srccard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-srccard / srcgrid`：
 *   .srcgrid > .srccard*(div.si(图标字) + div > (b + p > code + span.st))
 *   `.st.off` 表示停更 / 存档状态。
 *
 * 数据字段：items[{icon, name, meta, code, status, off}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'source-grid',
  name: '官方信源卡网格',
  hint: '图标 + 名称 + ID + 状态徽标',
  fields: [
    {
      key: 'items',
      label: '信源',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'icon', label: '图标字', type: 'text', hint: '如 微信 / 官网 / 抖音' },
          { key: 'name', label: '名称', type: 'text' },
          { key: 'meta', label: '类型说明', type: 'text' },
          { key: 'code', label: 'ID / 网址', type: 'text' },
          { key: 'status', label: '状态文字', type: 'text' },
          { key: 'off', label: '停更/存档', type: 'switch' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="srcgrid">
    <div v-for="item in data.items || []" :key="item.name" class="srccard">
      <div class="si">{{ item.icon }}</div>
      <div>
        <b>{{ item.name }}</b>
        <p>
          <code v-if="item.code">{{ item.code }}</code
          ><span v-if="item.meta"> · {{ item.meta }}</span>
        </p>
        <span v-if="item.status" class="st" :class="{ off: item.off }">{{ item.status }}</span>
      </div>
    </div>
  </div>
</template>
