<script setup lang="ts">
/**
 * 新闻正文编辑器（wangEditor + 结构化块，ADR-053 / ADR-054）
 *
 * v-model 暴露的是**正文块数组**（段落 / 小标题 / 图片 / 表格 / 视频），不是整篇 HTML：
 * 编辑器里正常排版（字号、颜色、对齐、加粗、列表、表格、图片、视频），`@on-change` 把 HTML 解析成块回写，
 * 回显再拼回 HTML。库里的正文仍然结构化（图文顺序、图片/表格/视频各自独立成块），
 * 块内允许**受限行内格式**（b/i/u/s/code + span 的 color / background-color / font-size）。
 *
 * 工具栏能力：小标题 / 字号 / 文字色 / 背景色 / 粗斜下划删除 / 左中右对齐 / 有序无序列表 /
 * 表格 / 上传图片 / 上传视频 / 清格式 / 撤销重做。
 * 不提供：字体族、行高、缩进、代码块、全屏（对落地页无意义或会把版式搞乱）。
 *
 * 素材：图片与视频都走素材库（filesApi.upload），落库存 publicUrl（/static/...），
 * 编辑器内用 resolveMediaUrl 转成后台可访问地址；每次上传都带上「来源」标签，素材库可按来源追溯。
 *
 * 后台是 SPA（ssr: false，见 docs/spec/03 §2.2 硬规则 7）：无 SSR 分支、无需 ClientOnly 守卫。
 */
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import { ElMessage } from 'element-plus'
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, filesApi, resolveMediaUrl, type ArticleBlock } from '~/config/api'

const model = defineModel<ArticleBlock[]>({ default: () => [] })

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string
    /** 编辑区高度（px） */
    height?: number
    /** 素材上传来源标签（写进素材库 source，便于追溯从哪个功能传的） */
    source?: string
  }>(),
  { placeholder: '请输入正文，可用工具栏插入图片 / 视频 / 表格', height: 320, source: '新闻正文' }
)

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()
/** 回写编辑器内容时置真，避免 setHtml 触发的 change 又反过来解析（造成循环） */
const syncing = ref(false)
/** iframe 视频提示只弹一次，避免每次输入都骚扰 */
let warnedIframe = false

/** 允许保留的行内标签（与服务端白名单同口径；SPAN 由 cleanStyle 校验后保留） */
const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'CODE', 'BR', 'SPAN'])

/** span 允许保留的样式：字号 / 文字色 / 背景色（值与服务端同口径校验） */
const COLOR_VALUE = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i
const SIZE_VALUE = /^\d{1,2}(?:\.\d)?px$/i

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 图片 / 视频地址 → 存库形态：绝对地址里的 /static/ 片段还原成站内路径，外链原样保留 */
function toStoredSrc(src: string): string {
  const match = /(\/static\/[^\s"'?#]+)/.exec(src)
  return match ? match[1] : src
}

/** 小标题层级收敛到 2~4 */
function normalizeLevel(level: number): number {
  return Math.min(4, Math.max(2, level || 2))
}

/** 对齐值收口 */
function readAlign(style: string | null | undefined): ArticleBlock['align'] {
  const value = String(style || '').trim()
  if (value === 'center' || value === 'right') return value
  if (value === 'left') return 'left'
  return undefined
}

/** span 样式收口：只留 color / background-color / font-size 的合法值 */
function cleanStyle(raw: string): string {
  const kept: string[] = []
  for (const part of String(raw || '').split(';')) {
    const index = part.indexOf(':')
    if (index <= 0) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (key === 'font-size' && SIZE_VALUE.test(value)) kept.push(`font-size:${value}`)
    if ((key === 'color' || key === 'background-color') && COLOR_VALUE.test(value)) kept.push(`${key}:${value}`)
  }
  return kept.join(';')
}

/**
 * 行内 HTML 收口：只留白名单标签；SPAN 保留受控 style，其余标签拆开只留文字
 */
function cleanInline(root: Element): string {
  const clone = root.cloneNode(true) as Element
  for (const el of Array.from(clone.querySelectorAll('*'))) {
    if (el.tagName === 'SPAN') {
      const style = cleanStyle(el.getAttribute('style') || '')
      if (!style) {
        el.replaceWith(...Array.from(el.childNodes))
        continue
      }
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
      el.setAttribute('style', style)
      continue
    }
    if (!INLINE_TAGS.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes))
      continue
    }
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
  }
  return clone.innerHTML.trim()
}

/** 块数组 → 编辑器 HTML */
function blocksToHtml(blocks: ArticleBlock[]): string {
  const list = Array.isArray(blocks) ? blocks : []
  if (!list.length) return '<p><br></p>'
  return list
    .map((block) => {
      if (block.kind === 'image' && block.src) {
        const alt = block.alt ? ` alt="${escapeHtml(block.alt)}"` : ''
        return `<p><img src="${escapeHtml(resolveMediaUrl(block.src))}"${alt}></p>`
      }
      if (block.kind === 'video' && block.src) {
        const poster = block.poster ? ` poster="${escapeHtml(resolveMediaUrl(block.poster))}"` : ''
        return `<video src="${escapeHtml(resolveMediaUrl(block.src))}"${poster} controls></video>`
      }
      if (block.kind === 'table' && block.rows?.length) {
        const head = block.header !== false ? block.rows[0] : null
        const body = block.header !== false ? block.rows.slice(1) : block.rows
        const headHtml = head ? `<tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr>` : ''
        const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
        return `<table><tbody>${headHtml}${bodyHtml}</tbody></table>`
      }
      const inner = block.html || escapeHtml(block.text || '')
      if (!inner) return ''
      const align = block.align ? ` style="text-align:${block.align};"` : ''
      if (block.kind === 'heading') {
        const level = normalizeLevel(Number(block.level) || 2)
        return `<h${level}${align}>${inner}</h${level}>`
      }
      return `<p${align}>${inner}</p>`
    })
    .filter(Boolean)
    .join('')
}

/** 编辑器 HTML → 块数组（段落 / 小标题 / 图片 / 表格 / 视频） */
function parseBlocks(html: string): ArticleBlock[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const blocks: ArticleBlock[] = []
  const textOf = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()

  /** 文本块（段落 / 小标题）：html 与 text 同时产出，对齐单独收口 */
  const pushText = (el: Element, kind: 'paragraph' | 'heading', level?: number, prefix = '') => {
    const text = textOf(el)
    if (!text) return
    const rect = el as HTMLElement
    const align = readAlign(rect.style?.textAlign)
    const inline = cleanInline(el)
    const hasTag = /<[a-z][\s\S]*?>/i.test(inline)
    const block: ArticleBlock = { kind, text: `${prefix}${text}` }
    if (hasTag) block.html = `${prefix ? escapeHtml(prefix) : ''}${inline}`
    if (align) block.align = align
    if (kind === 'heading') block.level = level
    blocks.push(block)
  }

  const pushImages = (el: Element) => {
    el.querySelectorAll('img').forEach((img) => {
      const src = toStoredSrc(img.getAttribute('src') || '')
      if (!src) return
      const alt = (img.getAttribute('alt') || '').trim()
      blocks.push(alt ? { kind: 'image', src, alt } : { kind: 'image', src })
    })
  }

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ kind: 'paragraph', text })
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if (tag === 'video') {
      const src = toStoredSrc(el.getAttribute('src') || '')
      if (src) {
        const poster = toStoredSrc(el.getAttribute('poster') || '')
        blocks.push(poster ? { kind: 'video', src, poster } : { kind: 'video', src })
      }
      continue
    }
    if (tag === 'iframe') {
      if (!warnedIframe) {
        warnedIframe = true
        ElMessage.warning('正文暂不支持外链播放器（iframe），请用「上传视频」插入 mp4')
      }
      continue
    }
    if (tag === 'table') {
      const trs = Array.from(el.querySelectorAll('tr'))
      const rows = trs
        .map((tr) => Array.from(tr.children).map((cell) => cleanInline(cell)))
        .filter((row) => row.some((cell) => cell.replace(/<[^>]+>/g, '').trim()))
      if (!rows.length) continue
      const header = trs[0] ? Array.from(trs[0].children).every((cell) => cell.tagName === 'TH') : false
      const align = readAlign((el as HTMLElement).style?.textAlign)
      blocks.push(align ? { kind: 'table', rows, header, align } : { kind: 'table', rows, header })
      continue
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      pushText(el, 'heading', normalizeLevel(Number(tag[1]) || 2))
      continue
    }
    if (tag === 'img') {
      pushImages(el.parentElement ?? el)
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li, index) => {
        pushText(li, 'paragraph', undefined, tag === 'ol' ? `${index + 1}. ` : '· ')
      })
      continue
    }
    /** p / div / blockquote / figure：文本优先，其次图片 / 视频容器 */
    const text = textOf(el)
    if (text) {
      pushText(el, 'paragraph')
      continue
    }
    if (el.querySelector('video')) {
      el.querySelectorAll('video').forEach((video) => {
        const src = toStoredSrc(video.getAttribute('src') || '')
        if (src) blocks.push({ kind: 'video', src })
      })
      continue
    }
    if (el.querySelector('img')) pushImages(el)
  }
  return blocks
}

/** 初始 HTML（仅编辑器创建时读取一次；创建之后到达的外部值走 watch 同步） */
const initialHtml = blocksToHtml(model.value)

/**
 * 工具栏：小标题 / 字号 / 字体色 / 背景色 / 粗斜下划删除 / 对齐 / 列表 / 表格 / 图片 / 视频 / 清格式 / 撤销重做
 * 注意：'group-image' 只是默认工具条里的内联分组定义（不是可注册的菜单 key），
 * 直接写字符串会抛「Not found menu item factory by key 'group-image'」，这里用菜单本体 'uploadImage'。
 */
const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: [
    'headerSelect',
    'fontSize',
    '|',
    'color',
    'bgColor',
    '|',
    'bold',
    'italic',
    'underline',
    'through',
    '|',
    'justifyLeft',
    'justifyCenter',
    'justifyRight',
    '|',
    'bulletedList',
    'numberedList',
    '|',
    'insertTable',
    'uploadImage',
    'uploadVideo',
    '|',
    'clearStyle',
    'undo',
    'redo'
  ]
}

/** 编辑器配置：图片 / 视频上传都走素材库，表格默认带表头 */
const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  MENU_CONF: {
    uploadImage: {
      maxFileSize: MAX_IMAGE_BYTES,
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
      async customUpload(file: File, insertFn: (url: string, alt: string, href: string) => void) {
        try {
          const item = await filesApi.upload(file, { source: `${props.source} · 内文配图` })
          insertFn(resolveMediaUrl(item.publicUrl), '', '')
        } catch {
          /** 错误提示由 http 层统一弹出 */
        }
      }
    },
    uploadVideo: {
      maxFileSize: MAX_VIDEO_BYTES,
      allowedFileTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      async customUpload(file: File, insertFn: (url: string, poster: string) => void) {
        try {
          const item = await filesApi.upload(file, { source: `${props.source} · 内文视频` })
          insertFn(resolveMediaUrl(item.publicUrl), '')
        } catch {
          /** 错误提示由 http 层统一弹出 */
        }
      }
    },
    insertTable: {
      withHeaderRow: true
    }
  }
}

function handleCreated(editor: IDomEditor) {
  editorRef.value = editor
}

/** 内容变化：解析成块数组回写 v-model；粘贴产生的内联图片先入库再回写 */
async function handleChange(editor: IDomEditor) {
  if (syncing.value) return
  const blocks = parseBlocks(editor.getHtml())
  const inline = blocks.filter((block) => block.kind === 'image' && block.src?.startsWith('data:'))
  if (inline.length) {
    syncing.value = true
    try {
      for (const block of inline) {
        const blob = await (await fetch(block.src as string)).blob()
        const name = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
        const item = await filesApi.upload(new File([blob], name, { type: blob.type }), {
          source: `${props.source} · 粘贴图片`
        })
        block.src = item.publicUrl
      }
      const html = blocksToHtml(blocks)
      editor.setHtml(html)
      model.value = blocks
      ElMessage.success('粘贴的图片已存入素材库')
    } catch {
      /** 上传失败：base64 会被服务端拒绝，直接从块里剔除并提示 */
      model.value = blocks.filter((block) => !block.src?.startsWith('data:'))
      ElMessage.warning('粘贴的图片上传失败，已移除，请用工具栏「图片」重试')
    } finally {
      syncing.value = false
    }
    return
  }
  if (JSON.stringify(blocks) !== JSON.stringify(model.value)) model.value = blocks
}

/** 编辑器创建后到达的外部值（如编辑弹窗异步回显正文）同步进编辑器；与当前内容一致时跳过，避免回流 */
watch(model, (value) => {
  const editor = editorRef.value
  if (!editor) return
  const current = parseBlocks(editor.getHtml())
  if (JSON.stringify(current) === JSON.stringify(value || [])) return
  syncing.value = true
  editor.setHtml(blocksToHtml(value || []))
  syncing.value = false
})

/** 组件销毁时同步销毁编辑器实例 */
onBeforeUnmount(() => {
  editorRef.value?.destroy()
})
</script>

<template>
  <div class="news-body-editor">
    <Toolbar class="nbe-toolbar" :editor="editorRef" :default-config="toolbarConfig" mode="default" />
    <Editor
      class="nbe-body"
      :style="{ height: `${props.height}px` }"
      :default-html="initialHtml"
      :default-config="editorConfig"
      mode="default"
      @on-created="handleCreated"
      @on-change="handleChange"
    />
  </div>
</template>

<style scoped lang="scss">
.news-body-editor {
  border: 1px solid $c-border-soft;
  border-radius: $radius-sm;
  width: 100%;
}

/** 不给外层 overflow: hidden：headerSelect 的下拉面板渲染在工具栏容器内部，裁剪会被切掉 */
.nbe-toolbar {
  border-bottom: 1px solid $c-border-soft;
  border-radius: $radius-sm $radius-sm 0 0;
}

/** 编辑器内部滚动：外层高度固定 + 滚动条只出现在编辑区内部 */
.nbe-body {
  overflow-y: hidden;
}
</style>
