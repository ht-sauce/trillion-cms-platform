<script setup lang="ts">
/**
 * 首页玻璃信息面板（原型 `.hero-panel`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 对应 99-blocks.html「一、全局外壳 · .hero-panel」：
 *   仅首页 1 处，Hero 右侧玻璃拟态面板：机构信息（地址/电话/门诊…）+ 2 个按钮。
 *
 * **渲染位置说明**：当本块紧跟在 hero-dark 之后时，渲染器会把它归并进 hero 块
 *   （见 BlockRenderer「首屏双栏归并」），由 hero-dark 内联渲染为 `.hero-in` 的右栏，
 *   共用设计稿的两栏网格。只有在其他位置单独使用时，本组件才自行渲染。
 */
import type { BlockContext } from '@trillion/shared'

/**
 * 行动按钮渲染方式（2026-10-14 需求）：电话类链接（tel: / mailto:）与空链接
 * 一律纯展示——渲染为 span，无跳转、无点击逻辑；站内路径仍用 NuxtLink 正常跳转。
 */
const isNonLink = (href: unknown) => !href || /^(tel:|mailto:)/.test(String(href))

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'hero-panel',
  name: '首页玻璃信息面板',
  hint: '首页 Hero 右侧玻璃面板：机构信息 + 行动按钮',
  fields: [
    { key: 'title', label: '面板标题', type: 'text', hint: '缺省「机构基本信息」' },
    {
      key: 'rows',
      label: '信息行',
      type: 'list',
      required: true,
      item: {
        type: 'group',
        fields: [
          { key: 'k', label: '项名', type: 'text', hint: '如「地址」「电话」「门诊时间」' },
          { key: 'v', label: '值', type: 'textarea' },
          { key: 'big', label: '放大显示', type: 'switch', hint: '电话用' },
          { key: 'sub', label: '副说明', type: 'text', hint: '如「午间不休息 · 周末正常接诊」' }
        ]
      }
    },
    {
      key: 'actions',
      label: '行动按钮',
      type: 'list',
      hint: '最多 2 个',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '文案', type: 'text' },
          { key: 'href', label: '链接', type: 'url' },
          { key: 'primary', label: '实心按钮', type: 'switch' }
        ]
      }
    }
  ]
})
</script>

<template>
  <aside class="hero-panel">
    <h3>{{ data.title || '机构基本信息' }}</h3>
    <div v-for="row in data.rows || []" :key="row.k" class="row">
      <span class="k">{{ row.k }}</span>
      <span class="v">
        <big v-if="row.big">{{ row.v }}</big>
        <template v-else>{{ row.v }}</template>
        <small v-if="row.sub">{{ row.sub }}</small>
      </span>
    </div>
    <div v-if="data.actions?.length" class="acts">
      <template v-for="action in data.actions" :key="action.label">
        <span v-if="isNonLink(action.href)" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
          {{ action.label }}
        </span>
        <NuxtLink v-else :to="action.href || '#'" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
          {{ action.label }}
        </NuxtLink>
      </template>
    </div>
  </aside>
</template>

<style>
/* 设计稿未给 hero-panel 的副说明设样式，补一处（仅字体与颜色） */
.hero-panel .v small {
  display: block;
  font-weight: 400;
  color: #8ba5c1;
  font-size: 12.5px;
}
</style>
