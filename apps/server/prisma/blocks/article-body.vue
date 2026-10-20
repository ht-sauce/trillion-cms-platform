<script setup lang="ts">
/**
 * 文章正文（原型 `.artbody` + `.cmpl` 合规声明）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-artmeta / artbody`，以及 news/*.html：
 *   .artbody > p*(段落) ＋ .cmpl > b + 合规声明
 *
 * 数据字段：blocks[{kind:'paragraph', text}] / disclaimer
 * 设计稿硬约束（09 §7.2 ⑥）：`disclaimer` 必填，为发布前置。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

const paragraphs = computed<string[]>(() =>
  (props.data?.blocks || [])
    .filter((block: any) => block?.kind === 'paragraph' && typeof block.text === 'string')
    .map((block: any) => block.text)
)

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const disclaimerHtml = computed(() => {
  const raw = props.data?.disclaimer
  if (typeof raw !== 'string') return ''
  return escapeHtml(raw.replace(/\n/g, '<br>'))
    .replace(/\[\[(.+?)\]\]/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
})

defineBlock({
  key: 'article-body',
  name: '文章正文',
  hint: '正文段落 + 合规声明（声明必填）',
  fields: [
    {
      key: 'blocks',
      label: '内容块',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'kind', label: '类型', type: 'select', options: ['paragraph'] },
          { key: 'text', label: '文本', type: 'textarea' }
        ]
      }
    },
    {
      key: 'disclaimer',
      label: '合规声明',
      type: 'textarea',
      required: true,
      hint: '必填，不填无法发布；开头的 **文字** 会加粗显示'
    }
  ]
})
</script>

<template>
  <div class="artbody">
    <p v-for="(para, index) in paragraphs" :key="index">{{ para }}</p>
  </div>
  <div v-if="disclaimerHtml" class="cmpl" v-html="disclaimerHtml" />
</template>

<style>
.artbody + .cmpl {
  margin-top: 20px;
}
</style>
