<script setup lang="ts">
/**
 * 三病种切换块（原型 `/services/` 的 #disease-switch，ADR-007 / HC-24）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 geo-site-bridge.css
 * 追加段承担（.dtabs/.dtab/.dpanel/.dlinks，源：站点/assets/css/disease-switch.css）。
 *
 * 原型 DOM（站点/services/index.html）：
 *   section#disease-switch > .wrap > (.sec-head > h2+p)
 *     + .dtabs[role=tablist] > button.dtab[data-d][aria-selected] > span.ddot + 文案
 *     + .dpanel[data-d][role=tabpanel].on > p.dlead + .chips>span.chip* + .dlinks>a*
 *
 * SSR 硬约束（GEO）：三个面板必须全部在服务端 HTML 直出，不用 v-if；
 * hydration 后仅切换 .on / aria-selected / hidden，确保搜索引擎与 AI 爬虫
 * 能在 curl 源码里读到三病种全文。零第三方依赖。
 *
 * 色系不写字面量（ESLint 拦截）：a=var(--teal-dk)，b=var(--disease-b)，
 * c=var(--disease-c)，后两者在站点样式层定义。
 */
import { computed, ref } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'disease-switch',
  name: '三病种切换',
  hint: '专病门诊的病种切换页签（白癜风 / 银屑病 / 胎记）；三个方向的内容都会完整呈现在页面里，页签只控制显示切换',
  fields: [
    { key: 'heading', label: '标题', type: 'text', default: '选择病种方向' },
    { key: 'subheading', label: '标题说明', type: 'textarea' },
    {
      key: 'tabs',
      label: '病种面板',
      type: 'list',
      required: true,
      item: {
        type: 'group',
        fields: [
          {
            key: 'disease',
            label: '病种方向',
            type: 'select',
            options: ['vitiligo', 'psoriasis', 'birthmark'],
            required: true,
            hint: 'vitiligo=白癜风，psoriasis=银屑病（牛皮癣），birthmark=胎记'
          },
          { key: 'label', label: '页签名', type: 'text', hint: '如 A · 白癜风门诊' },
          { key: 'lead', label: '病种导语', type: 'textarea' },
          { key: 'chips', label: '数据标签', type: 'list', item: { type: 'text' } },
          {
            key: 'links',
            label: '入口链接',
            type: 'list',
            item: {
              type: 'group',
              fields: [
                { key: 'text', label: '链接文案', type: 'text' },
                { key: 'href', label: '链接地址', type: 'url' },
                { key: 'external', label: '是否站外/锚点', type: 'switch' }
              ]
            }
          },
          { key: 'defaultOpen', label: '默认展开', type: 'switch' }
        ]
      }
    }
  ]
})

// data-d 标记：vitiligo->a / psoriasis->b / birthmark->c，与原型 CSS 选择器对齐
const DOT: Record<string, string> = { vitiligo: 'a', psoriasis: 'b', birthmark: 'c' }

const tabs = computed(() => props.data.tabs || [])
const initial = computed(() => {
  const idx = tabs.value.findIndex((t: any) => t.defaultOpen)
  return idx >= 0 ? idx : 0
})
const open = ref(initial.value)

function dot(disease: string) {
  return DOT[disease] || 'a'
}
</script>

<template>
  <div class="disease-switch">
    <div v-if="data.heading || data.subheading" class="sec-head">
      <div>
        <h2 v-if="data.heading">{{ data.heading }}</h2>
        <p v-if="data.subheading">{{ data.subheading }}</p>
      </div>
    </div>
    <div class="dtabs" role="tablist" aria-label="病种切换">
      <button
        v-for="(tab, i) in tabs"
        :key="tab.disease"
        type="button"
        class="dtab"
        :class="{ on: i === open }"
        :data-d="dot(tab.disease)"
        role="tab"
        :aria-selected="i === open"
        @click="open = i"
      >
        <span class="ddot" aria-hidden="true"></span>{{ tab.label }}
      </button>
    </div>
    <div
      v-for="(tab, i) in tabs"
      :key="`panel-${tab.disease}`"
      class="dpanel"
      :class="{ on: i === open }"
      :data-d="dot(tab.disease)"
      role="tabpanel"
      :aria-hidden="i !== open"
      :hidden="i !== open"
    >
      <p v-if="tab.lead" class="dlead">{{ tab.lead }}</p>
      <div v-if="tab.chips?.length" class="chips">
        <span v-for="chip in tab.chips" :key="chip" class="chip">{{ chip }}</span>
      </div>
      <div v-if="tab.links?.length" class="dlinks">
        <template v-for="(link, li) in tab.links" :key="li">
          <a
            v-if="link.external || !link.href || /^(https?:|tel:|#|mailto:)/.test(link.href)"
            :href="link.href"
            :rel="link.href && /^https?:/.test(link.href) ? 'noopener noreferrer' : null"
            :target="link.href && /^https?:/.test(link.href) ? '_blank' : null"
            >{{ link.text }}<span aria-hidden="true">→</span></a
          >
          <NuxtLink v-else :to="link.href">{{ link.text }}<span aria-hidden="true">→</span></NuxtLink>
        </template>
      </div>
    </div>
  </div>
</template>
