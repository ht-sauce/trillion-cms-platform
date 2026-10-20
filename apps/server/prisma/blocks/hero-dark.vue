<script setup lang="ts">
/**
 * 深色 Hero：页面首屏主视觉（原型 `.hero` / `.hero-in`）
 *
 * 【1:1 还原口径 · ADR-036】本组件直接使用原型类名与 DOM，视觉全部由
 * `public/assets/css/theme-b.css` + `site.css` 承担，模板内不写版式样式。
 * 因此这里**不使用 scoped style**，只负责产出正确结构的 class。
 *
 * 承载**全页唯一 H1**（设计稿硬约束）——因此它出现时页面骨架不再渲染 H1。
 * 导语必须自包含（60~120 字）：大模型摘取时往往只拿到这一段。
 *
 * 原型 DOM 对应 99-blocks.html `blk-hero / hero-in / pill-tag`：
 *   section.hero > .wrap.hero-in(.single) > div > .pill-tag + p.orgline + h1 + p.lead + .chips + .hero-actions
 *
 * 首页为双栏（`.hero-in` 无 `.single`）：右栏 `.hero-panel`。
 * 页面数据里 hero-dark 与 hero-panel 是并列的两个块，渲染器会把紧随其后的
 * hero-panel 收进本块的 `panel` 字段（见 BlockRenderer 首屏双栏归并），
 * 由本组件内联渲染右栏，从而复用设计稿的 `.hero-in` 网格，无需改设计稿。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** HTML 转义：先转义再注入受控标记，保证 v-html 内容安全 */
function escapeHtml(text: unknown) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 主标题：`\n` → `<br>`（设计稿 H1 为两行），高亮词用 `.grad` 包裹（青绿渐变字）。
 * 例：h1 = "专注白癜风分型分期诊疗\n与长期抗复发管理"，h1Grad = "分型分期"
 */
const h1Html = computed(() => {
  const text = escapeHtml(props.data.h1)
  const mark = escapeHtml(props.data.h1Grad || '')
  let out = text
  if (mark && text.includes(mark)) out = out.replace(mark, `<span class="grad">${mark}</span>`)
  return out.replace(/\n/g, '<br>')
})

/** 导语：`[[7045㎡]]` → `<em>7045㎡</em>`（设计稿 `.lead em` 硬数据高亮） */
const leadHtml = computed(() => escapeHtml(props.data.lead).replace(/\[\[(.+?)\]\]/g, '<em>$1</em>'))

/**
 * 行动按钮渲染方式（2026-10-14 需求）：电话类链接（tel: / mailto:）与空链接
 * 一律纯展示——渲染为 span，无跳转、无点击逻辑；站内路径仍用 NuxtLink 正常跳转。
 */
const isNonLink = (href: unknown) => !href || /^(tel:|mailto:)/.test(String(href))

defineBlock({
  key: 'hero-dark',
  name: '深色 Hero',
  hint: '页面开头的主视觉大图区；这里的主标题就是全页唯一的大标题（H1）',
  fields: [
    { key: 'eyebrow', label: '标签语', type: 'text', required: true, hint: '如「白癜风专科医疗机构 · 一个执业主体」' },
    {
      key: 'orgline',
      label: '备案行',
      type: 'text',
      hint: '如「西安市新城区卫生健康局审批备案 · 成立于2011年7月7日」'
    },
    { key: 'h1', label: '主标题', type: 'text', required: true, hint: '全页唯一的大标题；需要换行时用 \n' },
    { key: 'h1Grad', label: '主标题高亮词', type: 'text', hint: '青绿渐变高亮，如「分型分期」' },
    {
      key: 'lead',
      label: '导语',
      type: 'textarea',
      required: true,
      hint: '60~120 字，让患者单独读懂；[[文字]] 包住的内容会显示为高亮数字'
    },
    { key: 'chips', label: '标签组', type: 'list', item: { type: 'text' }, hint: '3~6 个' },
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
          { key: 'primary', label: '主按钮', type: 'switch' }
        ]
      }
    },
    { key: 'note', label: '按钮旁小字', type: 'text' }
  ]
})
</script>

<template>
  <section class="hero">
    <div class="wrap hero-in" :class="{ single: !props.data.panel }">
      <div>
        <div v-if="props.data.eyebrow" class="pill-tag"><i aria-hidden="true"></i>{{ props.data.eyebrow }}</div>
        <p v-if="props.data.orgline" class="orgline">{{ props.data.orgline }}</p>
        <h1 :class="{ sm: !props.data.panel }" v-html="h1Html"></h1>
        <p v-if="props.data.lead" class="lead" v-html="leadHtml"></p>

        <div v-if="props.data.chips?.length" class="chips">
          <span v-for="chip in props.data.chips" :key="chip" class="chip">{{ chip }}</span>
        </div>

        <div v-if="props.data.actions?.length || props.data.note" class="hero-actions">
          <template v-for="action in props.data.actions" :key="action.label">
            <span v-if="isNonLink(action.href)" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
              {{ action.label }}
            </span>
            <NuxtLink v-else :to="action.href || '#'" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
              {{ action.label }}
            </NuxtLink>
          </template>
          <span v-if="props.data.note" class="hero-note">{{ props.data.note }}</span>
        </div>
      </div>

      <!-- 首页双栏右栏：由紧随其后的 hero-panel 块归并而来（见 BlockRenderer） -->
      <aside v-if="props.data.panel" class="hero-panel">
        <h3>{{ props.data.panel.title || '机构基本信息' }}</h3>
        <div v-for="row in props.data.panel.rows || []" :key="row.k" class="row">
          <span class="k">{{ row.k }}</span>
          <span class="v" :class="{ 'v-mono': row.mono }">
            <big v-if="row.big">{{ row.v }}</big>
            <template v-else>{{ row.v }}</template>
            <small v-if="row.sub">{{ row.sub }}</small>
          </span>
        </div>
        <div v-if="props.data.panel.actions?.length" class="acts">
          <template v-for="action in props.data.panel.actions" :key="action.label">
            <span v-if="isNonLink(action.href)" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
              {{ action.label }}
            </span>
            <NuxtLink v-else :to="action.href || '#'" class="btn" :class="action.primary ? 'btn-teal' : 'btn-line'">
              {{ action.label }}
            </NuxtLink>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>

<style>
/* 设计稿未给 hero-panel 的副说明设样式，补一处（仅字体与颜色） */
.hero .hero-panel .v small {
  display: block;
  font-weight: 400;
  color: #8ba5c1;
  font-size: 12.5px;
}

/* 设计稿对证照编号用内联等宽字体（原型 01-index.html 执业许可行），收敛为类 */
.hero .hero-panel .v.v-mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
}
</style>
