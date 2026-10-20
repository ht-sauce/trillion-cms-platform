<script setup lang="ts">
/**
 * 诊疗项目卡组（原型 `.grid-3` + `.itemcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 11-services.html / 99-blocks.html `blk-itemcard`：
 *   .grid-3 > .itemcard* > (div.hd > div.cat + h4 + div.dev)
 *                          + (div.bd > div.kv*(div.k + div.v))
 *                          + (div.ft > div.price(> small) + a)
 *
 * 一个块 = 一组卡片（原型里 sec-head 与一组网格同处一个 section），
 * 检查 / 治疗 / 中医各成一组，由生成器各放一个块实例。
 *
 * 设计稿硬约束：价格为院内公示价，与公示一致，用 --amber 强调色。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'service-card',
  name: '诊疗项目卡组',
  hint: '一组项目卡：分类编码 + 名称 + 设备型号 + 键值行 + 公示价',
  fields: [
    { key: 'columns', label: '列数', type: 'select', options: ['2', '3', '4'], default: '3' },
    {
      key: 'items',
      label: '项目卡',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'cat', label: '分类编码', type: 'text', hint: '如「检测 · EXAM」' },
          { key: 'name', label: '项目名称', type: 'text', required: true },
          { key: 'dev', label: '设备型号', type: 'text', hint: '设备名 + 型号 + 注册证号' },
          {
            key: 'rows',
            label: '键值行',
            type: 'list',
            item: {
              type: 'group',
              fields: [
                { key: 'k', label: '项名', type: 'text' },
                { key: 'v', label: '值', type: 'textarea' }
              ]
            }
          },
          { key: 'price', label: '价格', type: 'text', hint: '如「80元」' },
          { key: 'href', label: '详情链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="grid" :class="`grid-${data.columns || 3}`">
    <div v-for="item in data.items || []" :key="item.name" class="itemcard">
      <div class="hd">
        <div v-if="item.cat" class="cat">{{ item.cat }}</div>
        <h4>{{ item.name }}</h4>
        <div v-if="item.dev" class="dev">{{ item.dev }}</div>
      </div>
      <div v-if="item.rows?.length" class="bd">
        <div v-for="(row, index) in item.rows" :key="index" class="kv">
          <div class="k">{{ row.k }}</div>
          <div class="v">{{ row.v }}</div>
        </div>
      </div>
      <div class="ft">
        <div v-if="item.price" class="price">{{ item.price }}<small>与公示一致</small></div>
        <NuxtLink v-if="item.href" :to="item.href">查看详情 →</NuxtLink>
      </div>
    </div>
  </div>
</template>
