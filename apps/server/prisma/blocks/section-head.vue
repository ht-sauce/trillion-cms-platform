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
 * 1. 每页只有一个 H1（通常由 hero-dark 承载），此处默认 H2，不得降级为 div；
 *    例外见下方「兼任页面主标题」（ADR-056）；
 * 2. titleHighlight 为紧跟标题的青绿高亮词（如「可核验的客观数据」）；
 * 3. desc 一句话说清本区块是什么，供大模型摘取。
 *
 * 兼任页面主标题（ADR-056）：
 *   页面没有首屏块时（问答 / 产品这类详情页），BlockRenderer 会给第一个 section-head
 *   注入 `context.pageTitle = true`，此时本块渲染 `<h1>` 并改用页面主标题字号——
 *   否则布局层会再补一条 H1 页头，同一条标题在页面上出现两次（历史 bug）。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 本块是否担任页面主标题（由 BlockRenderer 注入，页面没有首屏块时成立） */
const isPageTitle = computed(() => Boolean(props.context?.pageTitle))

defineBlock({
  key: 'section-head',
  name: '区块标题',
  hint: '全站统一 section 头部：H2 + 说明 + 更多链接（无首屏页面自动升级为 H1）',
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
  <div class="sec-head" :class="{ 'sec-head--page-title': isPageTitle }">
    <div>
      <component :is="isPageTitle ? 'h1' : 'h2'">
        {{ data.title
        }}<template v-if="data.titleHighlight"
          ><span> · {{ data.titleHighlight }}</span></template
        >
      </component>
      <p v-if="data.desc" :class="isPageTitle ? 'sec-head-label' : ''">{{ data.desc }}</p>
    </div>
    <NuxtLink v-if="data.moreLabel && data.moreHref" class="more" :to="data.moreHref">
      {{ data.moreLabel }}
    </NuxtLink>
  </div>
</template>

<style>
/**
 * 兼任页面主标题时的版式（ADR-056 / 2026-11-04 修正）：
 *   标题独占一行 —— 覆盖预设里 `.sec-head > div` 的「左标题 + 右说明」两列网格，
 *   否则长问题会把分类标签挤到标题右侧、标题被压成两行；
 *   副标题（desc，如「常见问题 · 选型」）降级成标题下方的小标签。
 */
.sec-head--page-title > div {
  display: block;
  width: 100%;
}

.sec-head--page-title h1 {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ink);
  max-width: none;
}

.sec-head--page-title h1 span {
  color: var(--teal-dk);
}

.sec-head--page-title p.sec-head-label {
  display: inline-block;
  margin-top: 14px;
  padding: 4px 13px;
  border-radius: 99px;
  background: var(--teal-lt);
  border: 1px solid #bfe9e3;
  color: #0b5a54;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
  max-width: none;
}

@media (max-width: 640px) {
  .sec-head--page-title h1 {
    font-size: 24px;
  }
}
</style>
