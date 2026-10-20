<script setup lang="ts">
/**
 * 框架块 · 门诊信息条（09 §7.1）
 *
 * DOM 与类名对齐设计稿原型 01-index.html 的 `.top`（09 §7.4.1 / ADR-036）：
 *   <div class="top"><div class="wrap">
 *     <div class="l"><span>门诊时间…</span></div>
 *     <div class="r"><span>预约热线：…</span></div>
 *   </div></div>
 * 样式全部来自原型 `theme-b.css`，本组件不写任何样式。
 *
 * 【2026-10-14 需求】预约热线为纯展示：不做 tel: 链接、无跳转、无点击逻辑。
 * 【2026-10-14 需求】去掉「白癜风专科 · 同一执业主体」圆标与右侧「专病门诊 / 预约就诊」两个入口，
 *   信息条只保留门诊时间 + 预约热线。
 *
 * 数据来源：站点档案的门诊时间 + 预约热线电话。
 * 门诊时间**逐字来自站点配置**，本组件不改写、不补全——
 * 页面上出现的每一个时间点都必须能在机构档案里找到出处。
 */
import type { OpeningHourRule } from '@trillion/shared'

const props = defineProps<{
  openingHours: OpeningHourRule[]
  phone: string | null
}>()

/** 门诊时间摘要：把规则数组压成一行可读文本（季节分组，备注保留） */
const summary = computed(() => {
  const hours = props.openingHours || []
  if (!hours.length) return ''
  return hours
    .map((rule) => {
      const season = rule.season ? `${rule.season}：` : ''
      return `${season}${rule.weekday} ${rule.open}-${rule.close}${rule.note ? `（${rule.note}）` : ''}`
    })
    .join('；')
})
</script>

<template>
  <div class="top">
    <div class="wrap">
      <div class="l">
        <span v-if="summary">门诊时间：{{ summary }}</span>
        <span v-else>门诊时间待补充（以机构最新公示为准）</span>
      </div>
      <div class="r">
        <span v-if="props.phone">预约热线：{{ props.phone }}</span>
      </div>
    </div>
  </div>
</template>
