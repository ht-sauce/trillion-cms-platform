<script setup lang="ts">
/**
 * 材料对比（material compare）
 *
 * 为什么不是一张静态对比表：材料选型的真实决策是「我这个工况更吃哪一项性能」，
 * 而不同体系的强弱项并不一致。做成指标切换，读者点几下就能看出哪一项是分水岭，
 * 比一张「聚氨酯 5 星 / 环氧 3 星」的表格诚实——星级本身没有依据。
 *
 * 数值口径：0~100 的**相对参考值**，用于同屏比较，不是检测报告数据；
 * 页面必须带 `note` 说明这一点，避免被当成实测值引用。
 *
 * 【样式自带】图表形态属于块本身，scoped 样式，不依赖 site.css（ADR-048）。
 */
import { computed, ref } from 'vue'

const props = defineProps<{ data: Record<string, any>; context: any }>()

const tabs = computed(() => props.data.tabs || [])
const series = computed(() => props.data.series || [])

/** 当前指标（键名取自 tabs[].key），默认第一项 */
const activeKey = ref(tabs.value[0]?.key || '')

const currentTab = computed(() => tabs.value.find((t: any) => t.key === activeKey.value) || tabs.value[0])

/** 取某体系在当前指标下的分值 */
function scoreOf(item: any, key: string): number {
  const hit = (item.scores || []).find((s: any) => s.metric === key)
  const n = Number(hit?.value)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
}

defineBlock({
  key: 'material-compare',
  name: '材料对比',
  hint: '按指标切换的体系对比条：耐冲洗 / 耐化学 / 耐温 / 耐磨',
  fields: [
    {
      key: 'tabs',
      label: '对比指标',
      type: 'list',
      hint: '2~5 个；key 用英文短词，供 scores.metric 引用',
      item: {
        type: 'group',
        fields: [
          { key: 'key', label: '标识', type: 'text', required: true, hint: '如 water / chem' },
          { key: 'label', label: '指标名', type: 'text', required: true, hint: '如 耐冲洗' },
          { key: 'note', label: '结论说明', type: 'textarea', hint: '这一项上两类体系的差别意味着什么' }
        ]
      }
    },
    {
      key: 'series',
      label: '体系',
      type: 'list',
      hint: '通常 2 个（聚氨酯 / 环氧）',
      item: {
        type: 'group',
        fields: [
          { key: 'name', label: '体系名', type: 'text', required: true },
          { key: 'code', label: '代号', type: 'text', hint: '如 PU / EP' },
          {
            key: 'scores',
            label: '各指标分值',
            type: 'list',
            hint: '0~100 相对参考值，每个指标一条',
            item: {
              type: 'group',
              fields: [
                { key: 'metric', label: '指标标识', type: 'text', required: true, hint: '须与上面某个 tab 的标识一致' },
                { key: 'value', label: '分值', type: 'number', required: true }
              ]
            }
          }
        ]
      }
    },
    {
      key: 'note',
      label: '口径声明',
      type: 'textarea',
      hint: '必须写清数值性质，如「相对参考值，非检测报告数据」'
    }
  ]
})
</script>

<template>
  <div class="cmp">
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        :class="{ on: activeKey === tab.key }"
        @click="activeKey = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="rows">
      <div v-for="(item, i) in series" :key="item.name" class="row">
        <span class="name">{{ item.name }}</span>
        <span class="track">
          <span class="fill" :class="`s-${i}`" :style="{ width: `${scoreOf(item, activeKey)}%` }"></span>
        </span>
        <span class="val">{{ scoreOf(item, activeKey) }}</span>
      </div>
    </div>

    <p v-if="currentTab?.note" class="conclusion">{{ currentTab.note }}</p>
    <p v-if="data.note" class="note">{{ data.note }}</p>
  </div>
</template>

<style scoped>
.cmp {
  background: #14171c;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: clamp(24px, 4vw, 44px);
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}
.tab {
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  padding: 9px 18px;
  border-radius: 99px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: #8a9099;
  cursor: pointer;
  transition: all 0.2s;
}
.tab:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}
.tab.on {
  background: var(--teal);
  border-color: var(--teal);
  color: var(--on-brand, #0b0d10);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.row {
  display: grid;
  grid-template-columns: 120px 1fr 44px;
  gap: 18px;
  align-items: center;
}
.name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}
.track {
  display: block;
  height: 8px;
  background: rgba(255, 255, 255, 0.09);
  border-radius: 99px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 99px;
  transition: width 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.fill.s-0 {
  background: var(--teal);
}
.fill.s-1 {
  background: #5f6b7a;
}
.fill.s-2 {
  background: #8a9099;
}
.val {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  text-align: right;
}
.conclusion {
  margin: 28px 0 0;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.66);
}
.note {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.8;
  color: #5f666f;
}
@media (max-width: 640px) {
  .row {
    grid-template-columns: 88px 1fr 34px;
    gap: 12px;
  }
}
</style>
