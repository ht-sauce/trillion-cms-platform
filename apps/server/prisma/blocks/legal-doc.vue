<script setup lang="ts">
/**
 * 法务文档（原型 `.legal` + `.nav` + `.body`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.legal`）：
 *   .legal > (aside.nav > a*(章节锚点)) + (div.body > (h2 + p)*)
 *   左侧 230px 粘顶目录 + 右侧正文。
 *
 * 数据字段：version / effectiveDate / sections[{id, heading, body}]
 * 设计稿硬约束：法务条款为固定文本，body 内 `\n` 需保留换行。
 */
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 正文中的换行 → 段落数组，保留原型 1.95 行高下的分段节奏 */
function lines(text: unknown): string[] {
  if (typeof text !== 'string') return []
  return text.split('\n').filter((line) => line.trim().length > 0)
}

defineBlock({
  key: 'legal-doc',
  name: '法务文档',
  hint: '左侧章节目录 + 右侧条款正文',
  fields: [
    { key: 'version', label: '版本号', type: 'text' },
    { key: 'effectiveDate', label: '生效日期', type: 'text' },
    {
      key: 'sections',
      label: '章节',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          {
            key: 'id',
            label: '章节标识',
            type: 'text',
            hint: '用于页内目录跳转，填英文或数字（如 fees），不会显示在页面上'
          },
          { key: 'heading', label: '标题', type: 'text' },
          { key: 'body', label: '正文', type: 'textarea' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="legal">
    <aside class="nav">
      <a v-for="section in props.data.sections || []" :key="section.id" :href="`#${section.id}`">
        {{ section.heading }}
      </a>
    </aside>
    <div class="body">
      <p v-if="props.data.version || props.data.effectiveDate" class="legal-meta">
        <span v-if="props.data.version">版本 {{ props.data.version }}</span>
        <span v-if="props.data.effectiveDate">生效日期 {{ props.data.effectiveDate }}</span>
      </p>
      <section v-for="section in props.data.sections || []" :key="section.id" :id="section.id">
        <h2>{{ section.heading }}</h2>
        <p v-for="(line, index) in lines(section.body)" :key="index">{{ line }}</p>
      </section>
    </div>
  </div>
</template>

<style>
/* 原型未画版本行样式，补最小说明行（仅一行小字） */
.legal .body .legal-meta {
  display: flex;
  gap: 16px;
  font-size: 12.4px;
  color: var(--ink-3);
  margin-bottom: 18px;
}
</style>
