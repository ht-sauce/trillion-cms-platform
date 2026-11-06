<script setup lang="ts">
/**
 * FAQ 问答列表（原型 `.faq` + `.q`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM（01-index.html FAQ 区块）：
 *   .faq > .q*(div.t > b(Q) + span(问题) + div.a(答案))
 *
 * 版式（ADR-058）：卡片固定高度（约 3 行），答案超出给「展开」——收起时不截断文字，
 * 只是裁掉可视区域；展开后完整展示富文本结构（段落 / 有序无序列表）。
 * 与 faq-index 的区别：faq-index 带序号/箭头并链到详情页，faq-list 是就地展开的简答。
 */
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

/**
 * 卡片折叠（ADR-058）：
 *   卡片高度固定（默认 3 行），答案超出才给「展开」——展开后显示完整结构与全部文字。
 *   是否溢出必须**实测**（HTML 结构不同、窗口宽度不同），所以用 scrollHeight 判定，
 *   并在 resize 时重测；已展开的卡片保留原判定结果，避免按钮在展开后消失。
 */
const root = ref<HTMLElement | null>(null)
const opened = reactive(new Set<number>())
const overflowing = reactive(new Set<number>())

function isOpen(index: number): boolean {
  return opened.has(index)
}

function toggle(index: number) {
  if (opened.has(index)) opened.delete(index)
  else opened.add(index)
  nextTick(() => measure())
}

/** 重新测量溢出：折叠态比限高更高才算溢出 */
function measure() {
  const nodes = root.value?.querySelectorAll<HTMLElement>('[data-faq-body]')
  if (!nodes) return
  nodes.forEach((el) => {
    const index = Number(el.dataset.faqBody)
    if (Number.isNaN(index)) return
    if (opened.has(index)) return
    if (el.scrollHeight - el.clientHeight > 4) overflowing.add(index)
    else overflowing.delete(index)
  })
}

onMounted(() => {
  void nextTick(measure)
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => window.removeEventListener('resize', measure))

defineBlock({
  key: 'faq-list',
  name: 'FAQ 问答列表',
  hint: '问答卡片：高度固定，答案超出可展开（保留段落与列表结构）',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '会作为这组问答的大标题显示' },
    {
      key: 'category',
      label: '分类标签',
      type: 'text',
      hint: '同一页放多组 FAQ 时用于分组，如「就诊流程」；单组可留空'
    },
    {
      key: 'items',
      label: '问答',
      type: 'list',
      hint: '答案按富文本结构展示（段落 / 列表），卡片超长时可展开',
      item: {
        type: 'group',
        fields: [
          { key: 'q', label: '问题', type: 'textarea', required: true },
          { key: 'a', label: '答案', type: 'textarea', required: true, hint: '可直接摘取的完整答案' }
        ]
      }
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['1', '2'],
      default: '2',
      hint: '答案较长时选 1 列，阅读更轻松'
    }
  ]
})
</script>

<template>
  <h2 v-if="data.title" class="faq-list-title">
    {{ data.title }}
    <span v-if="data.category" class="faq-list-cat">{{ data.category }}</span>
  </h2>

  <div ref="root" class="faq" :class="{ one: String(data.columns ?? '2') === '1' }">
    <div
      v-for="(item, index) in data.items || []"
      :key="index"
      class="q"
      :class="{ 'q-open': isOpen(index), 'q-clip': overflowing.has(index) }"
    >
      <div class="t">
        <b>Q</b><span>{{ item.q }}</span>
      </div>
      <!-- 有富文本答案就按结构渲染（段落 / 有序无序列表），否则退回纯文本 -->
      <!-- eslint-disable-next-line vue/no-v-html -- h 已在服务端白名单化（仅 p/ol/ul/li/行内标记） -->
      <div v-if="item.h" class="a" :data-faq-body="index" v-html="item.h" />
      <div v-else class="a" :data-faq-body="index">{{ item.a }}</div>
      <button v-if="overflowing.has(index)" type="button" class="a-toggle" @click="toggle(index)">
        {{ isOpen(index) ? '收起' : '展开' }}
      </button>
    </div>
  </div>
</template>

<style>
/* 原型 FAQ 标题通常在 .sec-head 里；这里补独立标题的最小样式 */
.faq-list-title {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.faq-list-cat {
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 99px;
  background: var(--teal-lt);
  border: 1px solid #bfe9e3;
  color: #0b5a54;
}

/**
 * 卡片答案（ADR-058）：固定高度 + 可展开。
 * 高度按 3 行取（行高 1.95 ≈ 3 行 5.9em），超出部分裁掉并做底部渐隐；
 * 展开后高度自适应、显示完整结构与文字。不再用「截断文字」的方式控长。
 */
.faq .q .a {
  position: relative;
  max-height: 5.9em;
  overflow: hidden;
  transition: max-height 0.18s ease;
}

.faq .q.q-clip:not(.q-open) .a::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.4em;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 78%);
  pointer-events: none;
}

.faq .q.q-open .a {
  max-height: none;
}

/* 富文本答案的结构版式（列表缩进，否则「1. 2. 3.」仍旧挤成一坨） */
.faq .q .a p {
  margin: 0 0 10px;
}

.faq .q .a p:last-child {
  margin-bottom: 0;
}

.faq .q .a ol,
.faq .q .a ul {
  margin: 0 0 10px;
  padding-left: 1.4em;
}

.faq .q .a ol {
  list-style: decimal;
}

.faq .q .a ul {
  list-style: disc;
}

.faq .q .a li {
  margin-bottom: 6px;
}

.faq .q .a li:last-child {
  margin-bottom: 0;
}

/* 展开 / 收起：低调的文字按钮，靠右 */
.a-toggle {
  display: block;
  margin: 6px 0 0 auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--teal-dk);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.a-toggle:hover {
  text-decoration: underline;
}
</style>
