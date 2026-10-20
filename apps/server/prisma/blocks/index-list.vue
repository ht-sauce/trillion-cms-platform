<script setup lang="ts">
/**
 * 全量索引列表（原型 `.idxsec` + `.idxlist`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-idxlist / idxsec`：
 *   .idxsec > (h3 > small(条数)) + .idxlist > a*(i(序号) + text)
 *   2 列紧凑索引，用于站点地图页。
 *
 * 数据字段：groups[{title, anchor, items[{text, href}]}]
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'index-list',
  name: '全量索引列表',
  hint: '站点地图：分组 + 序号 + 链接（2 列紧凑）',
  fields: [
    {
      key: 'groups',
      label: '分组',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'title', label: '分组标题', type: 'text' },
          { key: 'anchor', label: '锚点', type: 'text' },
          {
            key: 'items',
            label: '条目',
            type: 'list',
            item: {
              type: 'group',
              fields: [
                { key: 'text', label: '文字', type: 'text' },
                { key: 'href', label: '链接', type: 'url' }
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
  <div v-for="group in data.groups || []" :id="group.anchor" :key="group.title" class="idxsec">
    <h3>
      {{ group.title }} <small>{{ (group.items || []).length }} 条</small>
    </h3>
    <div class="idxlist">
      <NuxtLink v-for="(item, index) in group.items || []" :key="item.href || item.text" :to="item.href || '#'">
        <i>{{ String(index + 1).padStart(2, '0') }}</i
        >{{ item.text }}
      </NuxtLink>
    </div>
  </div>
</template>
