<script setup lang="ts">
/**
 * 纯文本编辑器（wangEditor 封装）
 * v-model 只暴露**纯文本**：初始化把段落间 `\n` 转成 `<p>`，内容变化用 `editor.getText()`
 * 输出纯文本（段落间 `\n`），样式不落库——最终提交只取纯文本
 * 工具栏精简为标题 + 基础强调类按钮（去掉图片 / 视频 / 表格 / 代码块 / 全屏等）
 * 后台是 SPA（ssr: false，见 docs/spec/03 §2.2 硬规则 7）：无 SSR 分支、无需 ClientOnly 守卫
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
  { placeholder: '请输入内容', height: 260 }
)

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()

/** 文本收口：统一换行符并去掉尾部空行，保证 v-model 与编辑器内容可比 */
function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 纯文本 → 初始化 HTML：按 `\n` 拆段，空段用 `<p><br></p>` 占位 */
function textToHtml(text: string): string {
  const lines = normalizeText(text).split('\n')
  if (lines.length === 1 && !lines[0]) return '<p><br></p>'
  return lines.map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('')
}

/** 初始 HTML（仅编辑器创建时读取一次；创建之后到达的外部值走 watch 同步） */
const initialHtml = textToHtml(model.value)

/** 工具栏精简：仅保留标题与基础强调按钮（内容最终只取纯文本，样式不参与提交） */
const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: [
    'headerSelect',
    'bold',
    'italic',
    'underline',
    'through',
    '|',
    'bulletedList',
    'numberedList',
    '|',
    'undo',
    'redo'
  ]
}

/** 编辑器配置：只放占位文案；内容变化走组件 @on-change 事件（defaultConfig 里传 onChange 会被封装拦截抛错） */
const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder
}

function handleCreated(editor: IDomEditor) {
  editorRef.value = editor
}

/** 内容变化即输出纯文本给 v-model */
function handleChange(editor: IDomEditor) {
  const text = normalizeText(editor.getText())
  if (text !== model.value) model.value = text
}

/** 编辑器创建后到达的外部值（如编辑弹窗异步回显正文）同步进编辑器；与当前内容一致时跳过，避免回流 */
watch(model, (val) => {
  const editor = editorRef.value
  if (!editor) return
  if (normalizeText(editor.getText()) === normalizeText(val || '')) return
  editor.setHtml(textToHtml(val || ''))
})

/** 组件销毁时同步销毁编辑器实例 */
onBeforeUnmount(() => {
  editorRef.value?.destroy()
})
</script>

<template>
  <div class="plain-text-editor">
    <Toolbar class="pte-toolbar" :editor="editorRef" :default-config="toolbarConfig" mode="default" />
    <Editor
      class="pte-body"
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
.plain-text-editor {
  border: 1px solid $c-border-soft;
  border-radius: $radius-sm;
}

/** 不给外层 overflow: hidden：headerSelect 的下拉面板渲染在工具栏容器内部，裁剪会被切掉 */
.pte-toolbar {
  border-bottom: 1px solid $c-border-soft;
  border-radius: $radius-sm $radius-sm 0 0;
}

/** 编辑器内部滚动：外层高度固定 + overflow hidden，滚动条只出现在编辑区内部 */
.pte-body {
  overflow-y: hidden;
}
</style>
