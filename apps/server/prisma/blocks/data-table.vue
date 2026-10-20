<script setup lang="ts">
/**
 * 结构化信息表（原型 `table.tb` / `table.pk`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css / site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-tb（表格）` / `blk-pk（表格）`：
 *   table.tb > tr*(td.k + td)                    —— 键值表（键列固定宽，项目/医师参数）
 *   table.pk > thead(tr>th*) + tbody(tr>td*)     —— 多列对照表（停车场等）
 *
 * 数据字段：title / headers[] / rows[][] / caption?
 * 判定：headers 为 2 列（项目/内容）时走键值表 `.tb`，否则走多列表 `.pk`。
 *
 * 设计稿硬约束：内容为可核验客观信息，不含疗效表述。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 恰好 2 列 → 键值表 `.tb`；否则多列对照表 `.pk` */
const isKeyValue = computed(() => Array.isArray(props.data?.headers) && props.data.headers.length === 2)

/** 把「**xxx**」渲染为加粗、「[[xxx]]」渲染为等宽高亮（与原型写法对齐） */
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/\[\[(.+?)\]\]/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

defineBlock({
  key: 'data-table',
  name: '结构化信息表',
  hint: '键值表 / 多列对照表；内容为可核验客观信息',
  fields: [
    { key: 'title', label: '表标题', type: 'text' },
    { key: 'headers', label: '表头', type: 'list', item: { type: 'text' }, hint: '2 列时走键值表样式' },
    {
      key: 'rows',
      label: '数据行',
      type: 'list',
      hint: '按表头顺序逐项填写；每行的条目数量必须与表头一致',
      item: { type: 'text' }
    },
    { key: 'caption', label: '表注', type: 'text' }
  ]
})
</script>

<template>
  <div class="data-table">
    <h3 v-if="data.title" class="data-table__title">{{ data.title }}</h3>

    <table v-if="isKeyValue" class="tb">
      <tbody>
        <tr v-for="(row, index) in data.rows || []" :key="index">
          <td class="k">{{ row[0] }}</td>
          <td v-html="renderCell(row[1])" />
        </tr>
      </tbody>
    </table>

    <table v-else class="pk">
      <thead>
        <tr>
          <th v-for="head in data.headers || []" :key="head">{{ head }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in data.rows || []" :key="index">
          <td v-for="(cell, ci) in row" :key="ci" v-html="renderCell(cell)" />
        </tr>
      </tbody>
    </table>

    <p v-if="data.caption" class="data-table__caption">{{ data.caption }}</p>
  </div>
</template>

<style>
/* 原型未给表标题设样式（标题通常在 .sec-head 里），此处补最小容器样式 */
.data-table .data-table__title {
  font-size: 15.5px;
  font-weight: 700;
  margin-bottom: 12px;
}

.data-table .data-table__caption {
  margin-top: 10px;
  font-size: 12.4px;
  color: var(--ink-3);
  line-height: 1.8;
}
</style>
