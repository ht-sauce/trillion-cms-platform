<script setup lang="ts">
/**
 * 横向条目卡列表（原型 `.klist` + `a.kitem`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-kitem / klist`：
 *   .klist > a.kitem*(div > (h4 + p) + span.ty)
 *   hover 右移 3px · 左侧描边变青绿。
 *
 * 数据字段：items[{title, desc, type, href}]（desc / type / href 可缺省）
 * 用途：科普条目、荣誉列表、诊疗科目清单等。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'list-rows',
  name: '横向条目卡列表',
  hint: '标题 + 摘要 + 右侧形式标签',
  fields: [
    {
      key: 'items',
      label: '条目',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'title', label: '标题', type: 'text' },
          { key: 'desc', label: '摘要', type: 'textarea' },
          { key: 'type', label: '形式标签', type: 'text', hint: '如「图文」「视频」' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="klist">
    <NuxtLink v-for="item in data.items || []" :key="item.title" class="kitem" :to="item.href || '#'">
      <div>
        <h4>{{ item.title }}</h4>
        <p v-if="item.desc">{{ item.desc }}</p>
      </div>
      <span v-if="item.type" class="ty">{{ item.type }}</span>
    </NuxtLink>
  </div>
</template>
