<script setup lang="ts">
/**
 * 页底咨询横幅（原型 `.telbar`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-telbar`（全局外壳件，但仅部分页面出现，
 * 因此按内容块处理而非框架常驻）：
 *   .telbar > div > (h3 + p) + a.btn.btn-teal
 *
 * 【2026-10-14 需求】电话类按钮为纯展示：`tel:` / `mailto:` / 空链接一律不渲染 `<a href>`，
 * 只保留按钮外观（.btn .btn-teal / .btn-line + site.css 的 cursor/hover 抑制）。
 * 【2026-11-02 扩展】新增可选 `href`：填站内路径时渲染为真实跳转（如「提交需求」→ /contact）。
 * 医疗站不填 href，行为与之前完全一致——按钮仍是纯展示。
 *
 * 用途：正文结束后的转化收口。文案只陈述事实，不写效果承诺。
 */
import type { BlockContext } from '@trillion/shared'
import { openDemand } from '~/utils/demand'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 电话 / 邮件 / 空链接：纯展示，不跳转 */
const isNonLink = (href: unknown) => !href || /^(tel:|mailto:)/.test(String(href))

defineBlock({
  key: 'telbar',
  name: '页底预约横幅',
  hint: '页面底部的咨询横幅：一段提示文字 + 按钮（可跳站内页面或纯展示电话）',
  fields: [
    { key: 'title', label: '标题', type: 'text', required: true, hint: '如「初诊建议提前电话预约，到院直接取号」' },
    { key: 'desc', label: '说明', type: 'textarea', hint: '门诊时间 / 地址 / 预约建议等事实信息' },
    {
      key: 'actions',
      label: '按钮',
      type: 'list',
      hint: '通常 1~2 个按钮',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '文案', type: 'text' },
          { key: 'primary', label: '主按钮', type: 'switch' },
          {
            key: 'href',
            label: '跳转地址',
            type: 'url',
            hint: '站内路径如 /contact；tel: / mailto: 或留空则按钮仅作展示，不跳转'
          }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="telbar">
    <div>
      <h3>{{ data.title }}</h3>
      <p v-if="data.desc">{{ data.desc }}</p>
    </div>
    <template v-for="action in data.actions || []" :key="action.label">
      <button
        v-if="/^\/contact\/?$/.test(String(action.href))"
        type="button"
        class="btn"
        :class="action.primary === false ? 'btn-line' : 'btn-teal'"
        @click="openDemand($event.currentTarget)"
      >
        {{ action.label }}
      </button>
      <NuxtLink
        v-else-if="!isNonLink(action.href)"
        class="btn"
        :class="action.primary === false ? 'btn-line' : 'btn-teal'"
        :to="action.href"
      >
        {{ action.label }}
      </NuxtLink>
      <span v-else class="btn" :class="action.primary === false ? 'btn-line' : 'btn-teal'">
        {{ action.label }}
      </span>
    </template>
  </div>
</template>
