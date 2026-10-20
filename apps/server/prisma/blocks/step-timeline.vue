<script setup lang="ts">
/**
 * 编号步骤卡（原型 `.steps` + `.step`；`.tl` + `.ti` 变体）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-steps / step` 与 `blk-tl / ti`：
 *   .steps > .step*(div.sn + b + p)     —— 编号步骤卡，右侧连接线（末项自动隐藏）
 *   .tl > .ti*(b + p)                   —— 时间轴，左侧渐变竖线 + 圆点
 *
 * 数据字段：title / steps[{no, title, desc}]  （variant = steps | timeline 决定样式）
 *
 * 设计稿硬约束：序号口径与全局一致（01/02/03 或 1 年内 / 1-3 年）；不含疗效承诺。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'step-timeline',
  name: '编号步骤卡 / 时间轴',
  hint: '两种形态：编号步骤卡（如就诊步骤、治疗流程）或时间轴（如发展规划、康复阶段）',
  fields: [
    { key: 'title', label: '标题', type: 'text' },
    {
      key: 'variant',
      label: '形态',
      type: 'select',
      options: ['steps', 'timeline'],
      default: 'steps',
      hint: 'steps=编号步骤卡，timeline=时间轴'
    },
    {
      key: 'steps',
      label: '步骤',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'no', label: '序号', type: 'text', hint: '如 1 / 01 / 1 年内' },
          { key: 'title', label: '标题', type: 'text' },
          { key: 'desc', label: '说明', type: 'textarea' }
        ]
      }
    }
  ]
})
</script>

<template>
  <template v-if="data.variant === 'timeline'">
    <div class="tl">
      <div v-for="(step, index) in data.steps || []" :key="index" class="ti">
        <b>{{ step.no || step.title }}</b>
        <p v-if="step.no && step.title">{{ step.title }}</p>
        <p>{{ step.desc }}</p>
      </div>
    </div>
  </template>
  <template v-else>
    <div class="steps">
      <div v-for="(step, index) in data.steps || []" :key="index" class="step">
        <div v-if="step.no" class="sn">{{ step.no }}</div>
        <b>{{ step.title }}</b>
        <p>{{ step.desc }}</p>
      </div>
    </div>
  </template>
</template>
