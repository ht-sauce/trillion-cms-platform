<script setup lang="ts">
/**
 * 新闻正文编辑器（wangEditor + 结构化块，ADR-053）
 *
 * v-model 暴露的是**正文块数组**（段落 / 小标题 / 图片），不是 HTML：
 * 编辑器里正常打字、插图片、选小标题，`@on-change` 把 HTML 解析成块数组回写，
 * 反向回显再把块数组拼成 HTML。这样数据库里存的是结构化内容（摘要、检索、GEO 取文可直取），
 * 前端又不至于被迫用 textarea 一行行敲。
 *
 * 图片：工具栏「图片 → 上传图片」走素材库（filesApi.upload），落库的是素材库 publicUrl（/static/...），
 * 编辑器里显示时用 resolveMediaUrl 转成后台可访问的绝对地址，解析回块时再还原成站内路径。
 * 粘贴进编辑器的内联图片（data:）会自动入库替换，避免把 base64 写进数据库。
 *
 * 后台是 SPA（ssr: false，见 docs/spec/03 §2.2 硬规则 7）：无 SSR 分支、无需 ClientOnly 守卫。
 */
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import { ElMessage } from 'element-plus'
import { filesApi, resolveMediaUrl, type ArticleBlock } from '~/config/api'

const model = defineModel<ArticleBlock[]>({ default: () => [] })

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string
    /** 编辑区高度（px） */
    height?: number
  }>(),
  { placeholder: '请输入正文，可用工具栏插入图片', height: 320 }
)

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()
/** 回写编辑器内容时置真，避免 setHtml 触发的 change 又反过来解析（造成循环） */
const syncing = ref(false)

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 图片地址 → 存库形态：绝对地址里的 /static/ 片段还原成站内路径，外链原样保留 */
function toStoredSrc(src: string): string {
  const match = /(\/static\/[^\s"'?#]+)/.exec(src)
  return match ? match[1] : src
}

/** 小标题层级收敛到 2~4 */
function normalizeLevel(level: number): number {
  return Math.min(4, Math.max(2, level || 2))
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
      if (block.kind === 'heading' && block.text) {
        const level = normalizeLevel(Number(block.level) || 2)
        return `<h${level}>${escapeHtml(block.text)}</h${level}>`
      }
      return block.text ? `<p>${escapeHtml(block.text)}</p>` : ''
    })
    .filter(Boolean)
    .join('')
}

/** 编辑器 HTML → 块数组（只认段落 / 小标题 / 图片；行内加粗等样式不落库） */
function parseBlocks(html: string): ArticleBlock[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const blocks: ArticleBlock[] = []
  const textOf = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim()

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

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = textOf(el)
      if (text) blocks.push({ kind: 'heading', text, level: normalizeLevel(Number(tag[1])) })
      continue
    }
    if (tag === 'img') {
      pushImages(el.parentElement ?? el)
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li) => {
        const text = textOf(li)
        if (text) blocks.push({ kind: 'paragraph', text })
      })
      continue
    }
    /** p / div / blockquote / figure：文本优先，纯图容器按图片块处理 */
    const text = textOf(el)
    const hasImage = Boolean(el.querySelector('img'))
    if (text) blocks.push({ kind: 'paragraph', text })
    else if (hasImage) pushImages(el)
  }
  return blocks
}

/** 初始 HTML（仅编辑器创建时读取一次；创建之后到达的外部值走 watch 同步） */
const initialHtml = blocksToHtml(model.value)

/** 工具栏：小标题 + 图片（上传 / 网络地址）+ 撤销重做；不提供加粗等行内样式（不落库，避免误以为生效） */
const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: ['headerSelect', '|', 'group-image', '|', 'undo', 'redo']
}

/** 编辑器配置：占位文案 + 图片上传走素材库 */
const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  MENU_CONF: {
    uploadImage: {
      maxFileSize: 10 * 1024 * 1024,
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
      /** 自定义上传：素材库返回 publicUrl，插入编辑器时用可访问的绝对地址 */
      async customUpload(file: File, insertFn: (url: string, alt: string, href: string) => void) {
        try {
          const item = await filesApi.upload(file)
          insertFn(resolveMediaUrl(item.publicUrl), '', '')
        } catch {
          /** 错误提示由 http 层统一弹出 */
        }
      }
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
        const item = await filesApi.upload(new File([blob], name, { type: blob.type }))
        block.src = item.publicUrl
      }
      const html = blocksToHtml(blocks)
      editor.setHtml(html)
      model.value = blocks
      ElMessage.success('粘贴的图片已存入素材库')
    } catch {
      /** 上传失败：保留原 base64 会被服务端拒绝，直接从块里剔除并提示 */
      model.value = blocks.filter((block) => !block.src?.startsWith('data:'))
      ElMessage.warning('粘贴的图片上传失败，已移除，请用工具栏「图片 → 上传图片」重试')
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
