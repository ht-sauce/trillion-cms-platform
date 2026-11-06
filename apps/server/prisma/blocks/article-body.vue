<script setup lang="ts">
/**
 * 文章正文（原型 `.artbody` + `.cmpl` 合规声明）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-artmeta / artbody`，以及 news/*.html：
 *   .artbody > p*(段落) ＋ .cmpl > b + 合规声明
 *
 * 数据字段（ADR-053 / ADR-054 / ADR-060）：
 *   html（整篇正文 HTML，优先；服务端 sanitizeArticleHtml 白名单化后原样输出）/
 *   blocks[{kind:'paragraph', text, html?, align?}] / [{kind:'heading', text, html?, align?, level}] /
 *   [{kind:'image', src, alt?, caption?}] / [{kind:'table', rows, header?, align?}] /
 *   [{kind:'video', src, poster?, caption?}] / [{kind:'rich', html}] / disclaimer
 *
 *   `html` 是 ADR-060 的主数据形态：排版（双列、图片尺寸、行内颜色/字号）由内容自身决定，
 *   渲染不再经过「块 → 固定模板」的二次降级；为空时回落 blocks（历史数据）。
 *
 *   `rich` 是块级受限 HTML（段落 + 有序/无序列表），给问答答案这类自带分点结构的内容用（ADR-058）；
 *   它只有 html、没有 text，过滤空块时必须单独放行，否则整块会被丢掉（正文变空白）。
 *
 * - 段落 / 小标题的 `html` 是**服务端白名单化后的行内标记**（b/strong/i/em/u/s/del/code/br + 受控 span 样式），
 *   因此可以安全 v-html；无 html 时把纯文本转义后输出。
 * - 表格单元格同样存白名单化行内 html；视频只接受素材库 / 外链地址，用原生 video 播放。
 * - `kind` 缺省按段落渲染，历史页面零迁移成本。
 * 设计稿硬约束（09 §7.2 ⑥）：`disclaimer` 必填，为发布前置。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

/** 渲染用正文块（html 补齐、空块过滤后） */
interface RenderBlock {
  kind: string
  html?: string
  text?: string
  align?: 'left' | 'center' | 'right'
  level?: number
  src?: string
  alt?: string
  caption?: string
  poster?: string
  rows?: string[][]
  header?: boolean
  /** 表格去掉表头行后的正文行 */
  bodyRows?: string[][]
}

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/**
 * 整篇正文 HTML（ADR-060）：有值时原样输出（服务端已白名单化），
 * 否则回落结构化块数组（历史数据）与纯文本段落。
 */
const htmlContent = computed(() => {
  const raw = props.data?.html
  return typeof raw === 'string' && raw.trim() ? raw : ''
})

/** 纯文本 → 可安全 v-html 的片段（转义尖括号与 &） */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 对齐 → 行内样式（缺省不输出，交给站点样式） */
function alignStyle(align?: string) {
  return align ? { textAlign: align as 'left' | 'center' | 'right' } : undefined
}

const blocks = computed<RenderBlock[]>(() => {
  const list = Array.isArray(props.data?.blocks) ? props.data.blocks : []
  return list
    .filter((block: any) => block && typeof block === 'object')
    .map((block: any): RenderBlock => {
      const kind = String(block.kind ?? 'paragraph')
      const rows: string[][] = Array.isArray(block.rows)
        ? block.rows.map((row: any) => (Array.isArray(row) ? row.map((cell: any) => String(cell ?? '')) : []))
        : []
      const header = block.header !== false
      return {
        kind,
        text: typeof block.text === 'string' ? block.text : undefined,
        html:
          typeof block.html === 'string'
            ? block.html
            : typeof block.text === 'string'
              ? escapeHtml(block.text)
              : undefined,
        align: block.align === 'left' || block.align === 'center' || block.align === 'right' ? block.align : undefined,
        level: Number(block.level) || 2,
        src: typeof block.src === 'string' ? block.src : undefined,
        alt: typeof block.alt === 'string' ? block.alt : undefined,
        caption: typeof block.caption === 'string' ? block.caption : undefined,
        poster: typeof block.poster === 'string' ? block.poster : undefined,
        rows,
        header,
        bodyRows: header ? rows.slice(1) : rows
      }
    })
    .filter((block) => {
      if (block.kind === 'image' || block.kind === 'video') return Boolean(block.src)
      if (block.kind === 'table') return Boolean(block.rows?.length)
      /** rich 块没有 text（结构全在 html 里），漏了这一行整块会被当成空块丢掉 */
      if (block.kind === 'rich') return Boolean(block.html)
      return Boolean(block.text)
    })
})

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
  hint: '整篇 HTML（优先）/ 正文段落 / 小标题 / 图片 / 表格 / 视频 / 富文本块 + 合规声明（声明必填）',
  fields: [
    {
      key: 'html',
      label: '整篇正文 HTML',
      type: 'textarea',
      hint: 'ADR-060 主数据：有值时原样渲染（服务端白名单化）；留空则用下方块数组'
    },
    {
      key: 'blocks',
      label: '内容块',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          {
            key: 'kind',
            label: '类型',
            type: 'select',
            options: ['paragraph', 'heading', 'image', 'table', 'video', 'rich']
          },
          { key: 'text', label: '文本', type: 'textarea', hint: '段落 / 小标题文本' },
          { key: 'level', label: '标题层级', type: 'number', hint: '小标题用：2 / 3 / 4，缺省 2' },
          { key: 'align', label: '对齐', type: 'select', options: ['', 'left', 'center', 'right'] },
          { key: 'src', label: '图片 / 视频地址', type: 'file', hint: '素材库地址（/static/...）' },
          { key: 'alt', label: '图片替代文本', type: 'text' },
          { key: 'caption', label: '说明', type: 'text', hint: '显示在图片 / 视频下方的图注' },
          { key: 'poster', label: '视频封面', type: 'file', hint: '视频块可选的封面图' }
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
    <!-- 整篇 HTML（ADR-060）：原样输出，排版与行内格式由编辑器/采集时决定 -->
    <!-- eslint-disable-next-line vue/no-v-html -- 已在服务端 sanitizeArticleHtml 白名单化 -->
    <div v-if="htmlContent" class="art-html" v-html="htmlContent" />

    <template v-else>
      <template v-for="(block, index) in blocks" :key="index">
        <figure v-if="block.kind === 'image'" class="art-fig">
          <img :src="block.src" :alt="block.alt || ''" loading="lazy" decoding="async" />
          <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
        </figure>

        <figure v-else-if="block.kind === 'video'" class="art-video">
          <video :src="block.src" :poster="block.poster || undefined" controls playsinline preload="metadata" />
          <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
        </figure>

        <div v-else-if="block.kind === 'table'" class="art-table" :style="alignStyle(block.align)">
          <table>
            <thead v-if="block.header && block.rows?.length">
              <tr>
                <!-- eslint-disable-next-line vue/no-v-html -- 单元格 html 已在服务端白名单化 -->
                <th v-for="(cell, ci) in block.rows[0]" :key="ci" v-html="cell" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in block.bodyRows" :key="ri">
                <!-- eslint-disable-next-line vue/no-v-html -- 同上 -->
                <td v-for="(cell, ci) in row" :key="ci" v-html="cell" />
              </tr>
            </tbody>
          </table>
        </div>

        <!-- rich：块级受限 HTML（段落 + 有序/无序列表，ADR-058 问答答案用），服务端已白名单化 -->
        <!-- eslint-disable-next-line vue/no-v-html -- 同上 -->
        <div v-else-if="block.kind === 'rich'" class="art-rich" v-html="block.html" />

        <!-- eslint-disable-next-line vue/no-v-html -- html 已在服务端白名单化（仅行内标记） -->
        <h2
          v-else-if="block.kind === 'heading'"
          :class="['art-h', `art-h${block.level}`]"
          :style="alignStyle(block.align)"
          v-html="block.html || block.text"
        />
        <!-- eslint-disable-next-line vue/no-v-html -- 同上 -->
        <p v-else :style="alignStyle(block.align)" v-html="block.html || block.text" />
      </template>
    </template>
  </div>
  <div v-if="disclaimerHtml" class="cmpl" v-html="disclaimerHtml" />
</template>

<style>
.artbody + .cmpl {
  margin-top: 20px;
}

/**
 * rich 块版式（ADR-058）：问答答案这类自带分点结构的内容
 * 列表要有缩进与行距，否则「1. 2. 3.」读起来仍是挤在一起。
 */
.artbody .art-rich p {
  margin: 0 0 14px;
}

.artbody .art-rich p:last-child {
  margin-bottom: 0;
}

.artbody .art-rich ol,
.artbody .art-rich ul {
  margin: 0 0 14px;
  padding-left: 1.5em;
}

.artbody .art-rich ol {
  list-style: decimal;
}

.artbody .art-rich ul {
  list-style: disc;
}

.artbody .art-rich li {
  margin-bottom: 8px;
  line-height: 1.9;
}

.artbody .art-rich li:last-child {
  margin-bottom: 0;
}
</style>
