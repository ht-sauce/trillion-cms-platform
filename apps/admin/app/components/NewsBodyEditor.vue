<script setup lang="ts">
/**
 * 正文编辑器（整篇 HTML，ADR-060）
 *
 * v-model 是**整篇正文 HTML 字符串**（不是块数组）：编辑时所见即所得，入库前由服务端
 * `sanitizeArticleHtml` 统一白名单化，站点渲染时原样输出——不再经过「块 → 模板」的二次降级。
 *
 * 两种模式：
 * - **可视化**（wangEditor）：常规图文排版（小标题 / 字号 / 颜色 / 对齐 / 列表 / 表格 / 图片 / 视频）。
 *   标题只给 H2/H3 —— 页面唯一 H1 由页面标题承担（GEO 硬约束），编辑器不再产出 H1。
 * - **源码**（textarea）：双列布局等 wangEditor 表达不了的排版直接用 HTML 编辑；
 *   两模式切换时互相同步，源码里的标签最终仍会被服务端白名单化。
 *
 * 素材：图片与视频都走素材库 `filesApi.upload`（库里存 `/static/...`，编辑器内用 `resolveMediaUrl` 显示），
 * 每次上传带「来源」标签，素材库可按来源追溯；粘贴的 base64 图片先入库再替换。
 *
 * 防卡死：编辑器必须在**可见容器**里初始化（放进 `el-tab-pane` 时该 pane 必须 `lazy`）；
 * `on-change` 与当前 v-model 完全一致时不回写，切断 setHtml ↔ change 循环。
 */
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import { ElMessage } from 'element-plus'
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, filesApi, resolveMediaUrl } from '~/config/api'

/** 整篇正文 HTML */
const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string
    /** 可视化编辑区高度（px） */
    height?: number
    /** 素材上传来源标签（写进素材库 source，便于追溯从哪个功能传的） */
    source?: string
  }>(),
  { placeholder: '请输入正文，可用工具栏插入图片 / 视频 / 表格', height: 320, source: '正文' }
)

/** 编辑模式：可视化 / HTML 源码 */
const mode = ref<'visual' | 'html'>('visual')
/** 源码模式文本（与 model 双向同步） */
const sourceText = ref('')

/** 编辑器实例（shallowRef：避免把编辑器内部对象做成深度响应式） */
const editorRef = shallowRef<IDomEditor>()
/** 回写编辑器内容时置真，避免 setHtml 触发的 change 又反过来回写（造成循环） */
const syncing = ref(false)
/** 组件已销毁（弹窗 destroy-on-close 后异步回显仍可能触发 watch） */
const destroyed = ref(false)

/** 初始 HTML（仅编辑器创建时读取一次；创建之后到达的外部值走 watch 同步） */
const initialHtml = model.value || '<p><br></p>'
/** 源码模式初始值 */
sourceText.value = model.value

/**
 * 工具栏：小标题（仅 H2/H3，无 H1）/ 字号 / 字体色 / 背景色 / 粗斜下划删除 / 对齐 / 列表 /
 * 表格 / 图片 / 视频 / 清格式 / 撤销重做
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
  /** 编辑器创建前到达的外部值在这里补一次，否则 watch 会因实例未就绪而跳过 */
  const value = model.value
  if (value && editor.getHtml() !== value) {
    syncing.value = true
    editor.setHtml(value)
    syncing.value = false
  }
}

/** 可视化模式内容变化：直接回写 HTML；粘贴的 base64 图片先入库再替换 */
async function handleChange(editor: IDomEditor) {
  if (syncing.value || destroyed.value || mode.value !== 'visual') return
  const html = editor.getHtml()
  /** 与当前 v-model 完全一致 → 不回写（切断 setHtml 的延迟回调循环） */
  if (html === model.value) return

  const pasted = /<img[^>]+src="(data:[^"]+)"/i.exec(html)
  if (pasted) {
    syncing.value = true
    try {
      const blob = await (await fetch(pasted[1])).blob()
      const name = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`
      const item = await filesApi.upload(new File([blob], name, { type: blob.type }), {
        source: `${props.source} · 粘贴图片`
      })
      const next = html.replace(pasted[0], pasted[0].replace(pasted[1], resolveMediaUrl(item.publicUrl)))
      editor.setHtml(next)
      model.value = next
      ElMessage.success('粘贴的图片已存入素材库')
    } catch {
      editor.setHtml(html.replace(/<img[^>]+src="data:[^"]+"[^>]*>/gi, ''))
      ElMessage.warning('粘贴的图片上传失败，已移除，请用工具栏「图片」重试')
    } finally {
      syncing.value = false
    }
    return
  }

  model.value = html
}

/** 外部值变化（编辑回显）同步进编辑器 / 源码框 */
watch(model, (value) => {
  const next = value || ''
  if (mode.value === 'html') {
    sourceText.value = next
    return
  }
  const editor = editorRef.value
  if (!editor || destroyed.value) return
  if (editor.getHtml() === next) return
  syncing.value = true
  editor.setHtml(next || '<p><br></p>')
  syncing.value = false
})

/** 切换编辑模式：先把当前模式的内容同步到 model，再切换 */
function switchMode(next: 'visual' | 'html') {
  if (next === mode.value) return
  if (mode.value === 'visual') {
    const html = editorRef.value?.getHtml() ?? model.value
    model.value = html
    sourceText.value = html
  } else {
    model.value = sourceText.value
    const editor = editorRef.value
    if (editor && !destroyed.value) {
      syncing.value = true
      editor.setHtml(sourceText.value || '<p><br></p>')
      syncing.value = false
    }
  }
  mode.value = next
}

/** 源码模式输入：直接写回 v-model */
function onSourceInput() {
  model.value = sourceText.value
}

/** 组件销毁时同步销毁编辑器实例 */
onBeforeUnmount(() => {
  destroyed.value = true
  editorRef.value?.destroy()
})
</script>

<template>
  <div class="news-body-editor">
    <div class="nbe-head">
      <el-radio-group :model-value="mode" size="small" @change="switchMode($event as 'visual' | 'html')">
        <el-radio-button value="visual">可视化</el-radio-button>
        <el-radio-button value="html">HTML 源码</el-radio-button>
      </el-radio-group>
      <span class="c-mute hint">双列等复杂排版请用「HTML 源码」编辑</span>
    </div>

    <template v-if="mode === 'visual'">
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
    </template>

    <el-input
      v-else
      class="nbe-source"
      type="textarea"
      :rows="14"
      :model-value="sourceText"
      placeholder="直接编辑整篇正文 HTML（保存时服务端会做白名单化；支持 div/flex 双列、figure 图注等）"
      @input="onSourceInput"
    />
  </div>
</template>

<style scoped lang="scss">
.news-body-editor {
  border: 1px solid $c-border-soft;
  border-radius: $radius-sm;
  width: 100%;
}

.nbe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $sp-1;
  padding: 4px $sp-1;
  border-bottom: 1px solid $c-border-soft;
}

.hint {
  font-size: 12px;
}

/** 不给外层 overflow: hidden：headerSelect 的下拉面板渲染在工具栏容器内部，裁剪会被切掉 */
.nbe-toolbar {
  border-bottom: 1px solid $c-border-soft;
}

/** 编辑器内部滚动：外层高度固定 + 滚动条只出现在编辑区内部 */
.nbe-body {
  overflow-y: hidden;
}

/** 源码模式：等宽字体，保留缩进 */
.nbe-source :deep(.el-textarea__inner) {
  font-family: $font-family-mono;
  line-height: 1.7;
}
</style>
