<script setup lang="ts">
/**
 * 文章正文（原型 `.artbody` + `.cmpl` 合规声明）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-artmeta / artbody`，以及 news/*.html：
 *   .artbody > p*(段落) ＋ .cmpl > b + 合规声明
 *
 * 数据字段：blocks[{kind:'paragraph', text}] / [{kind:'heading', text, level}] /
 *          [{kind:'image', src, alt, caption}] / disclaimer
 * 2026-11-04（ADR-053）：正文由「只有段落」扩展为段落 / 小标题 / 图片按顺序排列的块数组，
 * 图片走素材库 publicUrl（/static/...）；`kind` 缺省按段落渲染，历史页面零迁移成本。
 * 设计稿硬约束（09 §7.2 ⑥）：`disclaimer` 必填，为发布前置。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 正文块（只保留已知 kind，图片块必须有地址） */
const blocks = computed<{ kind: string; text?: string; src?: string; alt?: string; caption?: string; level?: number }[]>(
  () =>
    (Array.isArray(props.data?.blocks) ? props.data.blocks : [])
      .filter((block: any) => block && typeof block === 'object')
      .map((block: any) => ({
        kind: String(block.kind ?? 'paragraph'),
        text: typeof block.text === 'string' ? block.text : undefined,
        src: typeof block.src === 'string' ? block.src : undefined,
        alt: typeof block.alt === 'string' ? block.alt : undefined,
        caption: typeof block.caption === 'string' ? block.caption : undefined,
        level: Number(block.level) || 2
      }))
      .filter((block) => (block.kind === 'image' ? Boolean(block.src) : Boolean(block.text)))
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
  hint: '正文段落 / 小标题 / 图片 + 合规声明（声明必填）',
  fields: [
    {
      key: 'blocks',
      label: '内容块',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'kind', label: '类型', type: 'select', options: ['paragraph', 'heading', 'image'] },
          { key: 'text', label: '文本', type: 'textarea', hint: '段落 / 小标题文本' },
          { key: 'level', label: '标题层级', type: 'number', hint: '小标题用：2 / 3 / 4，缺省 2' },
          { key: 'src', label: '图片', type: 'file', hint: '图片块用：素材库地址（/static/...）' },
          { key: 'alt', label: '图片替代文本', type: 'text' },
          { key: 'caption', label: '图片说明', type: 'text', hint: '显示在图片下方的图注' }
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
    <template v-for="(block, index) in blocks" :key="index">
      <figure v-if="block.kind === 'image'" class="art-fig">
        <img :src="block.src" :alt="block.alt || ''" loading="lazy" decoding="async" />
        <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
      </figure>
      <h2 v-else-if="block.kind === 'heading'" :class="['art-h', `art-h${block.level}`]">{{ block.text }}</h2>
      <p v-else>{{ block.text }}</p>
    </template>
  </div>
  <div v-if="disclaimerHtml" class="cmpl" v-html="disclaimerHtml" />
</template>

<style>
.artbody + .cmpl {
  margin-top: 20px;
}
</style>
