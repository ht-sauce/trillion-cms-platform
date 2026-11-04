<script setup lang="ts">
/**
 * 问答答案编辑器（受限富文本，ADR-058）
 *
 * v-model 暴露的是**受限 HTML 字符串**（段落 / 有序无序列表 / 加粗斜体下划线删除线），
 * 不是 markdown、也不是纯文本：答案要保留分点结构，前台按结构渲染才不会糅成一段。
 *
 * 与新闻正文编辑器的区别：这里不分块（答案就是一段连续内容），不提供图片 / 表格 / 字号 / 颜色——
 * 问答卡片空间很小，这些能力放进去只会把列表撑变形。白名单与服务端
 * `common/utils/faq-answer.ts` 同口径（多一个都会在保存时被丢掉，编辑器里能设却不生效最坑）。
 */
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string
    /** 编辑区高度（px） */
    height?: number
  }>(),
  { placeholder: '输入答案；分点内容请用工具栏的编号列表，前台才会按结构展示', height: 220 }
)

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()
/** 回写编辑器内容时置真，避免 setHtml 触发的 change 反过来再写一遍 */
const syncing = ref(false)

/** 与服务端白名单一致：段落 / 列表 / 行内标记 */
const ALLOWED = new Set(['P', 'OL', 'UL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR'])

/** 初始 HTML：库里为空时给一个空段落，避免编辑器一片空白无光标 */
const initialHtml = computed(() => model.value?.trim() || '<p><br></p>')

/** 工具栏：只保留答案用得上的格式（粗斜下划删除 + 列表 + 清格式 + 撤销重做） */
const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: ['bold', 'italic', 'underline', 'through', '|', 'bulletedList', 'numberedList', '|', 'clearStyle', 'undo', 'redo']
}

const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  /** 关掉粘贴富文本的样式携带：只留结构，颜色字号一律不带 */
  hoverbarKeys: { text: { menuKeys: ['bold', 'italic', 'underline', 'through', 'clearStyle'] } }
}

function handleCreated(editor: IDomEditor) {
  editorRef.value = editor
}

/**
 * DOM → 受限 HTML：只留白名单标签、属性全丢（服务端还会再过一遍，
 * 这里做是为了「编辑器里看到的就是保存后的样子」）
 */
function cleanHtml(raw: string): string {
  const root = document.createElement('div')
  root.innerHTML = raw
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      walk(child)
      if (ALLOWED.has(child.tagName)) {
        for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name)
        continue
      }
      /** 非白名单标签拆开，只留里面的内容 */
      child.replaceWith(...Array.from(child.childNodes))
    }
  }
  walk(root)
  let html = root.innerHTML.trim()
  /** 只有空段的占位不算内容（避免把「空编辑器」当成有内容提交） */
  if (!html.replace(/<p>(<br>)?<\/p>/g, '').trim()) html = ''
  return html
}

function handleChange(editor: IDomEditor) {
  if (syncing.value) return
  const next = cleanHtml(editor.getHtml())
  if (next !== (model.value || '')) model.value = next
}

/** 外部改了值（切到另一条问答）时回写编辑器 */
watch(
  () => model.value,
  (value) => {
    const editor = editorRef.value
    if (!editor) return
    const current = cleanHtml(editor.getHtml())
    if ((value || '') === current) return
    syncing.value = true
    editor.setHtml(value?.trim() || '<p><br></p>')
    syncing.value = false
  }
)

onBeforeUnmount(() => {
  editorRef.value?.destroy()
})
</script>

<template>
  <div class="faq-answer-editor">
    <Toolbar class="fae-toolbar" :editor="editorRef" :default-config="toolbarConfig" mode="default" />
    <Editor
      class="fae-body"
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
.faq-answer-editor {
  border: 1px solid $c-border-soft;
  border-radius: $radius-sm;
  width: 100%;
}

/** 不给外层 overflow: hidden：下拉面板渲染在工具栏内部，裁剪会被切掉 */
.fae-toolbar {
  border-bottom: 1px solid $c-border-soft;
  border-radius: $radius-sm $radius-sm 0 0;
}

.fae-body {
  overflow-y: auto;
}
</style>
