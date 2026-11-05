<script lang="ts">
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { Boot, DomEditor, SlateEditor, SlateElement, SlateNode, SlateText, SlateTransforms } from '@wangeditor/editor'
import type { IButtonMenu, IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import { ElMessage } from 'element-plus'
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, filesApi, resolveMediaUrl } from '~/config/api'

const bodyEditors = new WeakSet<IDomEditor>()

Boot.registerModule({
  parseStyleHtml(element, node, editor) {
    if (!bodyEditors.has(editor)) return node
    if (!SlateText.isText(node)) {
      const bodyStyle: Record<string, string> = {}
      for (const key of [
        'font-size',
        'line-height',
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'vertical-align',
        'float',
        'display',
        'max-width'
      ]) {
        const value = element.style.getPropertyValue(key)
        if (value) bodyStyle[key] = value
      }
      if (Object.keys(bodyStyle).length) Object.assign(node, { bodyStyle })
      return node
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const weights = new Set<string | undefined>()
    const sizes = new Set<string | undefined>()
    while (walker.nextNode()) {
      const text = walker.currentNode
      if (!text.textContent?.trim()) continue
      weights.add(text.parentElement?.closest<HTMLElement>('[style*="font-weight"]')?.style.fontWeight)
      sizes.add(text.parentElement?.closest<HTMLElement>('[style*="font-size"]')?.style.fontSize)
    }
    const weight = weights.size === 1 ? weights.values().next().value : element.style.fontWeight
    const size = sizes.size === 1 ? sizes.values().next().value : element.style.fontSize
    if (size) Object.assign(node, { fontSize: size })
    if (weight === '600' || weight === '400' || weight === '700')
      Object.assign(node, { fontWeight: weight, bold: false })
    return node
  },
  renderStyle(node, vnode) {
    if ('bodyStyle' in node) {
      vnode.data ??= {}
      vnode.data.style = { ...vnode.data.style, ...(node.bodyStyle as Record<string, string>) }
    }
    if ('fontWeight' in node && ['600', '400', '700'].includes(String(node.fontWeight))) {
      vnode.data ??= {}
      vnode.data.style = { ...vnode.data.style, fontWeight: node.fontWeight }
    }
    return vnode
  },
  styleToHtml(node, html) {
    if ('bodyStyle' in node) {
      const root = document.createElement('div')
      root.innerHTML = html
      const element = root.firstElementChild as HTMLElement | null
      for (const [key, value] of Object.entries(node.bodyStyle as Record<string, string>)) {
        element?.style.setProperty(key, value)
      }
      html = root.innerHTML
    }
    if ('fontWeight' in node && ['600', '400', '700'].includes(String(node.fontWeight))) {
      const root = document.createElement('div')
      root.innerHTML = html
      if (root.childNodes.length === 1 && (root.firstChild as HTMLElement).style?.fontWeight === node.fontWeight)
        return html
      return `<span style="font-weight:${node.fontWeight}">${html}</span>`
    }
    return html
  }
})

/**
 * 图片环绕菜单（官方 @wangeditor/editor 的 IButtonMenu 扩展）
 *
 * 环绕样式写在**图片所在段落节点**的 `bodyStyle` 上，而不是图片节点自身：
 * wangEditor 渲染元素时会跳过 void 节点（图片 / 视频）的 `renderStyle`，写在图片节点上
 * 编辑器不生效；段落是普通元素，`renderStyle` 即时生效、`styleToHtml` 序列化回 `style`
 * 属性，因此编辑器内与站点都能保留 `float` / `margin` 并让后续文字绕排。
 */
interface NodeWithStyle {
  bodyStyle?: Record<string, string>
}

/** 环绕图片与文字之间的间距（左右方向对应镜像） */
const FLOAT_SPACING = {
  left: '0 16px 12px 0',
  right: '0 0 12px 16px'
} as const

type ImageFloat = keyof typeof FLOAT_SPACING | 'none'

const FLOAT_ICONS: Record<ImageFloat, string> = {
  left: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="2" y="4" width="8" height="9" rx="1"/><rect x="12" y="5" width="10" height="2"/><rect x="12" y="9" width="10" height="2"/><rect x="12" y="13" width="6" height="2"/><rect x="2" y="18" width="20" height="2"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="14" y="4" width="8" height="9" rx="1"/><rect x="2" y="5" width="10" height="2"/><rect x="2" y="9" width="10" height="2"/><rect x="2" y="13" width="6" height="2"/><rect x="2" y="18" width="20" height="2"/></svg>',
  none: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="8" y="3" width="8" height="6" rx="1" opacity="0.45"/><rect x="2" y="12" width="20" height="2"/><rect x="2" y="16" width="20" height="2"/><rect x="2" y="20" width="20" height="2"/></svg>'
}

/** 选中图片所在的段落：环绕样式挂在这一层 */
function imageParagraph(editor: IDomEditor): { path: number[]; node: NodeWithStyle } | null {
  const image = DomEditor.getSelectedNodeByType(editor, 'image')
  if (!image) return null
  const imagePath = DomEditor.findPath(editor, image)
  if (imagePath.length < 2) return null
  const path = imagePath.slice(0, -1)
  const node = SlateNode.get(editor, path)
  if (!SlateElement.isElement(node)) return null
  return { path, node: node as NodeWithStyle }
}

/** 当前选中图片的环绕方式（未选中图片或未设置时视为 none） */
function currentImageFloat(editor: IDomEditor): ImageFloat {
  const value = imageParagraph(editor)?.node.bodyStyle?.float
  return value === 'left' || value === 'right' ? value : 'none'
}

/** 给选中图片设置 / 取消环绕 */
function applyImageFloat(editor: IDomEditor, value: ImageFloat): void {
  const target = imageParagraph(editor)
  if (!target) return
  const bodyStyle: Record<string, string> = { ...(target.node.bodyStyle ?? {}) }
  if (value === 'none') {
    delete bodyStyle.float
    if (bodyStyle.margin === FLOAT_SPACING.left || bodyStyle.margin === FLOAT_SPACING.right) delete bodyStyle.margin
  } else {
    bodyStyle.float = value
    bodyStyle.margin = FLOAT_SPACING[value]
  }
  SlateTransforms.setNodes(editor, { bodyStyle }, { at: target.path })
}

function registerFloatMenu(key: string, value: ImageFloat): void {
  const title = value === 'none' ? '取消图片环绕' : value === 'left' ? '图片左环绕' : '图片右环绕'
  Boot.registerMenu({
    key,
    factory: (): IButtonMenu => ({
      title,
      iconSvg: FLOAT_ICONS[value],
      tag: 'button',
      getValue: (editor) => currentImageFloat(editor) === value,
      isActive: (editor) => currentImageFloat(editor) === value,
      isDisabled: (editor) => !DomEditor.getSelectedNodeByType(editor, 'image'),
      exec: (editor) => applyImageFloat(editor, value)
    })
  })
}

registerFloatMenu('articleImageFloatLeft', 'left')
registerFloatMenu('articleImageFloatRight', 'right')
registerFloatMenu('articleImageFloatNone', 'none')
</script>

<script setup lang="ts">
/**
 * 正文编辑器（整篇 HTML，ADR-060）
 *
 * v-model 是**整篇正文 HTML 字符串**：所见即所得，服务端原样入库、站点原样输出。
 *
 * 工具栏：H2/H3 小标题（**不提供 H1**，页面唯一 H1 由页面标题承担）、字号、文字色、背景色、
 * 粗斜下划删除、左中右对齐、有序无序列表、表格、上传图片、图片左右环绕、上传视频、
 * 清格式、撤销重做。
 *
 * 素材：图片与视频都走素材库 `filesApi.upload`（库里存 `/static/...`，编辑器内用
 * `resolveMediaUrl` 显示），每次上传带「来源」标签；粘贴的 base64 图片先入库再替换。
 *
 * 防卡死：编辑器必须在**可见容器**里初始化（放进 `el-tab-pane` 时该 pane 必须 `lazy`）；
 * `on-change` 内容与当前 v-model 完全一致时不回写，切断 setHtml ↔ change 循环；
 * 组件销毁后不再操作编辑器实例。
 */
/** 整篇正文 HTML */
const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string
    /** 编辑区高度（px） */
    height?: number
    /** 素材上传来源标签（写进素材库 source，便于追溯从哪个功能传的） */
    source?: string
  }>(),
  { placeholder: '请输入正文，可用工具栏插入图片 / 视频 / 表格', height: 320, source: '正文' }
)

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()
/** 回写编辑器内容时置真，避免 setHtml 触发的 change 又反过来回写（造成循环） */
const syncing = ref(false)
/** 组件已销毁（弹窗 destroy-on-close 后异步回显仍可能触发 watch） */
const destroyed = ref(false)

function resolveEditorMedia(raw: string): string {
  if (!raw.trim()) return ''
  const root = document.createElement('div')
  root.innerHTML = raw
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const weightedText: [Node, string][] = []
  while (walker.nextNode()) {
    const text = walker.currentNode
    const weight = text.parentElement?.closest<HTMLElement>('[style*="font-weight"]')?.style.fontWeight
    if (
      (weight === '600' || weight === '400') &&
      (text.parentElement?.tagName !== 'SPAN' || text.parentElement.style.fontWeight !== weight)
    )
      weightedText.push([text, weight])
  }
  for (const [text, weight] of weightedText) {
    const span = document.createElement('span')
    span.style.fontWeight = weight
    text.parentNode?.replaceChild(span, text)
    span.append(text)
  }
  for (const figure of root.querySelectorAll('figure')) {
    if (!figure.querySelector('img') || figure.querySelector('figcaption, video, iframe')) continue
    if (
      Array.from(figure.childNodes).some((node) =>
        node.nodeType === Node.TEXT_NODE
          ? Boolean(node.textContent?.trim())
          : node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'IMG'
      )
    )
      continue
    const paragraph = document.createElement('p')
    for (const attribute of figure.attributes) {
      paragraph.setAttribute(attribute.name, attribute.value)
    }
    paragraph.append(...Array.from(figure.childNodes))
    figure.replaceWith(paragraph)
  }
  for (const element of root.querySelectorAll('img[src], video[src], video[poster], source[src]')) {
    if (element.tagName === 'IMG') {
      const image = element as HTMLImageElement
      for (const key of ['width', 'height'] as const) {
        const value = image.getAttribute(key)
        if (!image.style[key] && value && /^\d+(?:\.\d+)?(?:px|%)?$/.test(value)) {
          image.style[key] = /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value
        }
      }
    }
    for (const attribute of ['src', 'poster']) {
      const url = element.getAttribute(attribute)
      if (url) element.setAttribute(attribute, resolveMediaUrl(url))
    }
  }
  return root.innerHTML
}

function serializeEditorMedia(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html
  for (const element of root.querySelectorAll('img[src], video[src], video[poster], source[src]')) {
    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      for (const prefix of ['/static/', '/assets/']) {
        const resolved = resolveMediaUrl(prefix)
        if (resolved !== prefix && value.startsWith(resolved)) {
          element.setAttribute(attribute, `${prefix}${value.slice(resolved.length)}`)
          break
        }
      }
    }
  }
  return root.innerHTML
}

/** 初始 HTML（仅编辑器创建时读取一次；创建之后到达的外部值走 watch 同步） */
const initialHtml = ''
let appliedValue = ''
const uploadingImages = new Set<string>()
const failedImages = new Set<string>()
/** 当前编辑器里「由程序写入」的内容快照：change 事件若与之一致，说明只是 setHtml 的回声，不回写 v-model */
let appliedHtml = ''

/**
 * 工具栏：小标题 / 字号 / 字体色 / 背景色 / 粗斜下划删除 / 对齐 / 列表 / 表格 /
 * 图片 / 图片环绕 / 视频 / 清格式 / 撤销重做
 *
 * 标题用官方原生菜单 key `header2` / `header3`（`headerSelect` 下拉硬编码了 H1–H5，
 * 没有过滤项；改用单级按钮即可去掉 H1 入口，H4/H5 仍可用快捷键或粘贴内容产生）。
 */
const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: [
    'header2',
    'header3',
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
    'articleImageFloatLeft',
    'articleImageFloatRight',
    'articleImageFloatNone',
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
  autoFocus: false,
  MENU_CONF: {
    uploadImage: {
      maxFileSize: MAX_IMAGE_BYTES,
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
      async customUpload(file: File, insertFn: (url: string, alt: string, href: string) => void) {
        try {
          const item = await filesApi.upload(file, { source: `${props.source} · 内文配图` })
          if (destroyed.value) return
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
          if (destroyed.value) return
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
  if (destroyed.value) {
    editor.destroy()
    return
  }
  bodyEditors.add(editor)
  editorRef.value = editor
  appliedHtml = editor.getHtml()
  const value = String(model.value ?? '')
  if (!value.trim()) {
    appliedValue = value
    return
  }
  applyHtml(editor, value)
}

function applyHtml(editor: IDomEditor, raw: string) {
  syncing.value = true
  try {
    editor.blur()
    editor.setHtml(resolveEditorMedia(raw))
    editor.history.undos = []
    editor.history.redos = []
    appliedHtml = editor.getHtml()
    appliedValue = raw
  } finally {
    syncing.value = false
  }
}

/** 内容变化：直接回写 HTML；粘贴的 base64 图片先入库再替换 */
async function handleChange(editor: IDomEditor) {
  if (syncing.value || destroyed.value) return
  const html = editor.getHtml()
  /** 程序写入的回声 / 与当前 v-model 完全一致 → 不回写（切断 setHtml 的延迟回调循环） */
  if (html === appliedHtml || html === model.value) return

  appliedHtml = html
  appliedValue = serializeEditorMedia(html)
  model.value = appliedValue
  const pasted = Array.from(html.matchAll(/<img[^>]+src="(data:[^"]+)"/gi), (match) => match[1])
  for (const src of new Set(pasted)) {
    if (uploadingImages.has(src) || failedImages.has(src)) continue
    uploadingImages.add(src)
    try {
      const blob = await (await fetch(src).catch(() => null))?.blob()
      if (!blob) throw new Error('读取粘贴图片失败')
      const name = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
      const item = await filesApi.upload(new File([blob], name, { type: blob.type }), {
        source: `${props.source} · 粘贴图片`
      })
      if (destroyed.value || editorRef.value !== editor) return
      const images = Array.from(
        SlateEditor.nodes(editor, {
          at: [],
          match: (node) => 'type' in node && node.type === 'image' && node.src === src
        })
      )
      if (!images.length) continue
      syncing.value = true
      try {
        for (const [, path] of images) {
          SlateTransforms.setNodes(editor, { src: resolveMediaUrl(item.publicUrl) }, { at: path })
        }
      } finally {
        syncing.value = false
      }
      appliedHtml = editor.getHtml()
      appliedValue = serializeEditorMedia(appliedHtml)
      model.value = appliedValue
      ElMessage.success('粘贴的图片已存入素材库')
    } catch {
      failedImages.add(src)
      if (!destroyed.value) ElMessage.warning('粘贴的图片上传失败，图片仍保留，请用工具栏「上传图片」重试后再保存')
    } finally {
      uploadingImages.delete(src)
    }
  }
}

/** 外部值变化（编辑回显）同步进编辑器 */
watch(model, (value) => {
  const editor = editorRef.value
  if (!editor || destroyed.value) return
  if (value === appliedValue || editor.getHtml() === value) return
  applyHtml(editor, value || '')
})

/** 组件销毁时同步销毁编辑器实例 */
onBeforeUnmount(() => {
  destroyed.value = true
  editorRef.value?.destroy()
  editorRef.value = undefined
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

/** 不给外层 overflow: hidden：下拉面板渲染在工具栏容器内部，裁剪会被切掉 */
.nbe-toolbar {
  border-bottom: 1px solid $c-border-soft;
  border-radius: $radius-sm $radius-sm 0 0;
}

/** 编辑器内部滚动：外层高度固定 + 滚动条只出现在编辑区内部 */
.nbe-body {
  overflow-y: hidden;

  :deep([data-slate-editor]) {
    font-family: $font-family-base;
    font-size: 14.6px;
    line-height: 1.9;
    color: $c-text;

    p {
      margin: 0 0 14px;
      line-height: inherit;
    }

    p:last-child {
      margin-bottom: 0;
    }

    h2,
    h3,
    h4 {
      font-weight: 800;
      line-height: 1.5;
      margin: 28px 0 12px;
    }

    h2 {
      font-size: $font-size-figure;
    }

    h3 {
      font-size: $font-size-xl;
    }

    h4 {
      font-size: 15px;
    }

    b,
    strong {
      font-weight: 800;
    }

    [data-slate-node='element']:has(> [data-w-e-reserve]) {
      margin-top: 0 !important;
      margin-bottom: $sp-1 !important;
      padding-left: 1.5em;
      position: relative;

      > [data-w-e-reserve] {
        position: absolute;
        left: 0;
      }
    }

    .table-container {
      border: 0;
      border-radius: 0;
      margin: 0 0 14px;
      padding: 0;
    }

    table {
      border-collapse: collapse;
    }

    table th,
    table td {
      border: 1px solid $c-border;
      padding: $sp-1;
      min-width: 30px;
      line-height: inherit;
      text-align: left;
    }

    table th {
      background: $c-table-head;
      font-weight: 800;
    }

    table p {
      margin: 0;
    }

    .w-e-image-container {
      margin: 0;
    }

    img {
      min-width: 0;
      min-height: 0;
      height: auto;
    }
  }
}
</style>
