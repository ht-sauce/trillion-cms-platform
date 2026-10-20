<script setup lang="ts">
/**
 * 区块标题（原型 `.sec-head` / `.more`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-sec-head / more`：
 *   .sec-head > div > h2(标题 + span 高亮) + p(说明)  ＋  a.more
 *
 * 设计稿硬约束：
 * 1. 每页只有一个 H1（由 hero-dark 承载），此处固定用 H2，不得降级为 div；
 * 2. titleHighlight 为紧跟标题的青绿高亮词（如「可核验的客观数据」）；
 * 3. desc 一句话说清本区块是什么，供大模型摘取。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'section-head',
  name: '区块标题',
  hint: '全站统一 section 头部：H2 + 说明 + 更多链接',
  fields: [
    { key: 'title', label: '标题', type: 'text', required: true, hint: '会作为这一节的大标题显示' },
    { key: 'titleHighlight', label: '高亮词', type: 'text', hint: '青绿高亮，如「可核验的客观数据」' },
    { key: 'desc', label: '说明', type: 'textarea', hint: '一句话说清本区块' },
    { key: 'moreLabel', label: '更多链接文案', type: 'text', hint: '如「全部项目 →」' },
    { key: 'moreHref', label: '更多链接地址', type: 'url' }
  ]
})
</script>

<template>
  <div class="sec-head">
    <div>
      <h2>
        {{ data.title
        }}<template v-if="data.titleHighlight"
          ><span> · {{ data.titleHighlight }}</span></template
        >
      </h2>
      <p v-if="data.desc">{{ data.desc }}</p>
    </div>
    <NuxtLink v-if="data.moreLabel && data.moreHref" class="more" :to="data.moreHref">
      {{ data.moreLabel }}
    </NuxtLink>
  </div>
</template>
