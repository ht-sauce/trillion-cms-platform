<script setup lang="ts">
/**
 * 框架件 · 信息条（09 §7.1）
 *
 * DOM 与类名对齐设计稿原型 01-index.html 的 `.top`（09 §7.4.1 / ADR-036）：
 *   <div class="top"><div class="wrap">
 *     <div class="l"><span>时间…</span></div>
 *     <div class="r"><span>热线：…</span></div>
 *   </div></div>
 * 样式全部来自原型 `theme-b.css`，本组件不写任何样式。
 *
 * 【2026-10-14 需求】预约热线为纯展示：不做 tel: 链接、无跳转、无点击逻辑。
 * 【2026-10-14 需求】去掉「白癜风专科 · 同一执业主体」圆标与右侧「专病门诊 / 预约就诊」两个入口，
 *   信息条只保留时间 + 热线。
 * 【2026-11-02 行业适配】文案按站点 `businessType` 分派（ADR-047）：
 *   医疗站「门诊时间 / 预约热线」，工业与工程站「服务时间 / 咨询热线」——
 *   地坪公司没有「门诊」，硬套会让实体口径自相矛盾，对 GEO 是负信号。
 *
 * 时间**逐字来自站点配置**，本组件不改写、不补全——
 * 页面上出现的每一个时间点都必须能在机构档案里找到出处；weekday 只做中英显示映射。
 */
import type { OpeningHourRule } from '@trillion/shared'

const props = defineProps<{
  openingHours: OpeningHourRule[]
  phone: string | null
  /** medical=医疗（门诊口径）/ industrial=工业与工程（服务口径） */
  businessType?: string
}>()

/** 医疗口径 vs 工业口径的措辞 */
const labels = computed(() =>
  props.businessType === 'industrial'
    ? { time: '服务时间', hotline: '咨询热线', pending: '服务时间待补充' }
    : { time: '门诊时间', hotline: '预约热线', pending: '门诊时间待补充（以机构最新公示为准）' }
)

/**
 * schema.org 的 dayOfWeek 是英文枚举，中文站页面上要显示中文。
 * 单日与「逗号分隔的区间」两套都要覆盖——区间是规格允许的写法（一条规则表示周一到周六），
 * 只映射单日会让顶部条直接漏出 `Monday,Tuesday,...` 这样的英文串。
 */
const WEEKDAY_CN: Record<string, string> = {
  Monday: '周一',
  Tuesday: '周二',
  Wednesday: '周三',
  Thursday: '周四',
  Friday: '周五',
  Saturday: '周六',
  Sunday: '周日',
  'Monday,Tuesday': '周一、周二',
  'Monday,Tuesday,Wednesday,Thursday,Friday': '周一至周五',
  'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday': '周一至周六',
  'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday': '每日',
  'Saturday,Sunday': '周六、周日'
}

/** 查询前去掉空格：`Monday, Tuesday` 与 `Monday,Tuesday` 视为同一写法 */
function weekdayCn(weekday: string): string {
  const key = String(weekday || '').replace(/\s+/g, '')
  return WEEKDAY_CN[key] || WEEKDAY_CN[weekday] || weekday
}

/** 时间摘要：把规则数组压成一行可读文本（季节分组，备注保留） */
const summary = computed(() => {
  const hours = props.openingHours || []
  if (!hours.length) return ''
  return hours
    .map((rule) => {
      const season = rule.season ? `${rule.season}：` : ''
      const day = weekdayCn(rule.weekday)
      return `${season}${day} ${rule.open}-${rule.close}${rule.note ? `（${rule.note}）` : ''}`
    })
    .join('；')
})
</script>

<template>
  <div class="top">
    <div class="wrap">
      <div class="l">
        <span v-if="summary">{{ labels.time }}：{{ summary }}</span>
        <span v-else>{{ labels.pending }}</span>
      </div>
      <div class="r">
        <span v-if="props.phone">{{ labels.hotline }}：{{ props.phone }}</span>
      </div>
    </div>
  </div>
</template>
