<script setup lang="ts">
/**
 * 页底预约横幅（原型 `.telbar`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-telbar`（全局外壳件，但仅部分页面出现，
 * 因此按内容块处理而非框架常驻）：
 *   .telbar > div > (h3 + p) + a.btn.btn-teal
 *
 * 【2026-10-14 需求】预约热线按钮为纯展示：不渲染 <a href>、无跳转、无点击逻辑，
 * 仅保留按钮外观（.btn .btn-teal / .btn-line + site.css 的 cursor/hover 抑制）。
 *
 * 用途：正文结束后的转化收口（预约热线）。文案只陈述事实（门诊时间 / 地址 /
 * 预约建议），不写疗效与承诺。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'telbar',
  name: '页底预约横幅',
  hint: '页面底部的预约提醒横幅：一段预约提示文字 + 预约电话按钮',
  fields: [
    { key: 'title', label: '标题', type: 'text', required: true, hint: '如「初诊建议提前电话预约，到院直接取号」' },
    { key: 'desc', label: '说明', type: 'textarea', hint: '门诊时间 / 地址 / 预约建议等事实信息' },
    {
      key: 'actions',
      label: '按钮',
      type: 'list',
      hint: '通常 1 个预约热线按钮',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '文案', type: 'text' },
          { key: 'primary', label: '主按钮', type: 'switch' }
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
    <span
      v-for="action in data.actions || []"
      :key="action.label"
      class="btn"
      :class="action.primary === false ? 'btn-line' : 'btn-teal'"
    >
      {{ action.label }}
    </span>
  </div>
</template>
