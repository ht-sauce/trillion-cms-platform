<script setup lang="ts">
/**
 * 院区实景图网格（原型 `.envgrid`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-envgrid`：
 *   .envgrid > figure*(div.im > img + figcaption(标题 + small(说明)))
 *   3 列图卡，4:3 比例，hover 上浮。
 *
 * 数据字段：items[{img, alt, caption, note}]
 * 设计稿硬约束：每张图必须有说明，不做无标注装饰图。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'env-grid',
  name: '院区实景图网格',
  hint: '3 列图卡 + 图注',
  fields: [
    {
      key: 'items',
      label: '图片',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'img', label: '图片', type: 'text', hint: '图片路径，如 /assets/img/env/xxx.jpg（从素材库复制）' },
          { key: 'alt', label: '替代文字', type: 'text' },
          { key: 'caption', label: '图注标题', type: 'text' },
          { key: 'note', label: '补充说明', type: 'text' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="envgrid">
    <figure v-for="item in data.items || []" :key="item.img">
      <div class="im">
        <img :src="item.img" :alt="item.alt || item.caption" loading="lazy" />
      </div>
      <figcaption>
        {{ item.caption }}
        <small v-if="item.note">{{ item.note }}</small>
      </figcaption>
    </figure>
  </div>
</template>
