<script setup lang="ts">
/**
 * 新闻资讯弹窗（新建 / 编辑）
 * 规范：弹窗一律独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新
 * 列表接口不返回正文，编辑打开时拉单条详情回显（含正文）
 * URL 片段不对用户开放：服务端按标题自动生成（slug 创建后不可改，无需展示）
 * 保存成功后服务端自动触发站点构建，提示带一句「站点正在重新构建」
 * 正文为结构化块数组（段落 / 小标题 / 图片，ADR-053）：编辑器插图片走素材库，
 * content 由段落文本派生后一并提交（服务端仍以 body 为准，纯文本仅供摘要与检索）
 */
import { ElMessage } from 'element-plus'
import { newsFaqApi, type ArticleBlock, type NewsArticleItem } from '~/config/api'
import ImageField from './ImageField.vue'
import NewsBodyEditor from './NewsBodyEditor.vue'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 归属站点（父页面当前选中的站点） */
  siteId?: string
  /** 编辑对象；null 表示新建 */
  article: NewsArticleItem | null
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run, isLoading, runKeyed } = useLoading()

const form = reactive({
  title: '',
  publishDate: '',
  summary: '',
  body: [] as ArticleBlock[],
  cover: ''
})

/** 纯文本 → 正文块（历史数据只有 content 时的回显路径） */
function textToBlocks(text: string): ArticleBlock[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ kind: 'paragraph' as const, text: line }))
}

/** 正文块 → 纯文本（提交时派生 content，供摘要 / 检索 / GEO 取文） */
function blocksToText(blocks: ArticleBlock[]): string {
  return blocks
    .filter((block) => block.kind !== 'image' && block.text)
    .map((block) => block.text as string)
    .join('\n')
}

/** 编辑对象（打开后不再变化，供提交分支判断） */
const editing = computed(() => props.article)

/** 素材上传来源标签：带上文章标题前 24 字，素材库里能看出是哪篇的图 */
const editorSource = computed(() => {
  const title = form.title.trim().slice(0, 24)
  return title ? `新闻正文 · ${title}` : '新闻正文'
})

/** 每次打开重置表单；编辑时拉单条详情回显（列表行不含正文，按表记录 id 寻址） */
watch(visible, (open) => {
  if (!open) return
  form.title = props.article?.title ?? ''
  form.publishDate = props.article?.publishDate ?? ''
  form.summary = props.article?.summary ?? ''
  form.body = []
  if (props.article) {
    void runKeyed('detail', async () => {
      const detail = await newsFaqApi.articleDetail(props.article!.id)
      form.title = detail.title ?? form.title
      form.publishDate = detail.publishDate ?? form.publishDate
      form.summary = detail.summary ?? form.summary
      form.body = detail.body?.length ? detail.body : textToBlocks(detail.content ?? '')
      form.cover = detail.cover ?? ''
    })
  }
})

/** 今日零点（本地时区）：发布日期不允许早于今天，与服务端强校验口径一致 */
const todayStart = new Date().setHours(0, 0, 0, 0)

/** 提交（防抖在外、loading 在内）；发布日期必填且不得早于今天；URL 片段由服务端按标题自动生成，不对外收集 */
const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!form.publishDate) {
    ElMessage.warning('请选择发布日期')
    return
  }

  const body = form.body.filter((block) => (block.kind === 'image' ? Boolean(block.src) : Boolean(block.text?.trim())))
  if (!body.length) {
    ElMessage.warning('请输入正文')
    return
  }

  const payload = {
    title: form.title.trim(),
    publishDate: form.publishDate,
    summary: form.summary.trim() || undefined,
    content: blocksToText(body),
    body,
    cover: form.cover.trim() || null
  }

  return run(async () => {
    if (editing.value) {
      await newsFaqApi.updateArticle(editing.value.id, payload)
    } else {
      await newsFaqApi.createArticle({ siteId: props.siteId!, ...payload })
    }
    ElMessage.success(editing.value ? '已保存，站点正在重新构建' : '已创建，站点正在重新构建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editing ? '编辑新闻' : '新建新闻'" width="960px" :close-on-click-modal="false">
    <el-form v-loading="isLoading('detail')" label-width="88px" size="small">
      <el-form-item label="标题" required>
        <el-input v-model="form.title" maxlength="120" placeholder="新闻标题" />
      </el-form-item>
      <el-form-item label="发布日期" required>
        <el-date-picker
          v-model="form.publishDate"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="(date: Date) => date.getTime() < todayStart"
          placeholder="选择发布日期"
          style="width: 160px"
        />
      </el-form-item>
      <el-form-item label="摘要">
        <el-input
          v-model="form.summary"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
          placeholder="展示在列表与搜索结果里的内容摘要"
        />
      </el-form-item>
      <el-form-item label="封面图">
        <ImageField v-model="form.cover" source="新闻 · 封面图" placeholder="上传或粘贴素材库地址（详情页首屏背景）" />
      </el-form-item>
      <el-form-item label="正文内容">
        <NewsBodyEditor
          v-model="form.body"
          :height="440"
          :source="editorSource"
          placeholder="请输入正文，可用工具栏插入字号 / 颜色 / 表格 / 图片 / 视频"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
