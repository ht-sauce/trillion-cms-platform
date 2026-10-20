<script setup lang="ts">
/**
 * 页面编辑器：模板 + 结构化 Block（每个 Block 类型一个表单，非富文本自由编辑）
 * 右侧实时 GEO 体检，发布前必须通过校验（error 级）
 */
import { ElMessage } from 'element-plus'
import { contentApi, sitesApi, type PageItem } from '~/config/api'
import { STATUS_META } from '~/config/menu'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const route = useRoute()
const isNew = computed(() => route.params.id === 'new')

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { loading: saving, run } = useLoading()

const sites = ref<{ id: string; name: string }[]>([])
const channels = ref<{ id: string; name: string }[]>([])
const geo = ref<{ score: number; issues: { level: string; message: string }[] } | null>(null)

const form = ref<Partial<PageItem>>({
  templateId: 'default',
  title: '',
  slug: '',
  summary: '',
  authorName: '',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  blocks: []
})

const blockTypes = [
  { type: 'hero', label: '首屏 Banner' },
  { type: 'text', label: '图文段落' },
  { type: 'faq', label: 'FAQ 问答' },
  { type: 'imageList', label: '图片列表' },
  { type: 'contact', label: '联系信息' }
]

function newBlock(type: string) {
  if (type === 'hero') return { type, title: '', subtitle: '' }
  if (type === 'text') return { type, heading: '', paragraphs: [''] }
  if (type === 'faq') return { type, items: [{ question: '', answer: '' }] }
  if (type === 'imageList') return { type, items: [] }
  return { type, address: '', phone: '', email: '' }
}

function addBlock(type: string) {
  form.value.blocks = [...(form.value.blocks || []), newBlock(type)]
}

function removeBlock(index: number) {
  form.value.blocks = (form.value.blocks || []).filter((_, i) => i !== index)
}

function addParagraph(block: { paragraphs: string[] }) {
  block.paragraphs.push('')
}

function addFaq(block: { items: { question: string; answer: string }[] }) {
  block.items.push({ question: '', answer: '' })
}

async function load() {
  const siteResult = await sitesApi.list({ pageSize: 100 })
  sites.value = siteResult.list
  if (isNew.value) {
    if (siteResult.list.length) {
      form.value.siteId = siteResult.list[0].id
      const channelList = await contentApi.channels(siteResult.list[0].id)
      channels.value = channelList
      if (channelList.length) form.value.channelId = channelList[0].id
    }
    return
  }
  const detail = await contentApi.pageDetail(String(route.params.id))
  form.value = detail
  const channelList = await contentApi.channels(detail.siteId)
  channels.value = channelList
}

async function onSiteChange() {
  if (!form.value.siteId) return
  const channelList = await contentApi.channels(form.value.siteId)
  channels.value = channelList
}

/** 保存 / 提交审核 / 发布（防抖在外、loading 在内） */
const save = debounce(
  (status?: string) =>
    run(async () => {
      if (isNew.value) {
        const created = await contentApi.createPage(form.value)
        ElMessage.success('页面已创建')
        navigateTo(`/content/${created.id}`)
        return
      }
      await contentApi.updatePage(String(route.params.id), form.value)
      if (status) await contentApi.changeStatus(String(route.params.id), status as 'published')
      ElMessage.success('保存成功')
      await load()
    }),
  DEBOUNCE_WAIT
)

/** 重新体检（防抖在外、loading 在内） */
const runCheck = debounce(
  () =>
    run(async () => {
      geo.value = await contentApi.geoCheck(String(route.params.id))
    }),
  DEBOUNCE_WAIT
)

onMounted(() => {
  load()
  if (!isNew.value) runCheck()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="crumb">内容 /</span>
      <span class="panel-title">{{ form.title || (isNew ? '新建页面' : '编辑页面') }}</span>
      <span v-if="!isNew && form.status" class="status-tag" :class="`s-${form.status}`">
        {{ STATUS_META[form.status]?.label || form.status }}
      </span>
      <span class="spacer" />
      <el-button size="small" @click="navigateTo('/content')">返回</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="save()">保存</el-button>
      <el-button v-if="!isNew" type="success" size="small" :loading="saving" @click="save('pending_review')"
        >提交审核</el-button
      >
      <el-button v-if="!isNew" type="success" size="small" :loading="saving" @click="save('published')">发布</el-button>
    </div>

    <div class="cols">
      <div class="panel main">
        <div class="hd"><span class="panel-title">基本信息</span></div>
        <div class="body grid2">
          <div class="field">
            <label>标题 *（渲染为 H1）</label>
            <input v-model="form.title" class="inp" />
          </div>
          <div class="field">
            <label>slug *</label>
            <input v-model="form.slug" class="inp" />
          </div>
          <div class="field">
            <label>站点</label>
            <el-select v-model="form.siteId" size="small" @change="onSiteChange">
              <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
          <div class="field">
            <label>栏目</label>
            <el-select v-model="form.channelId" size="small">
              <el-option v-for="c in channels" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </div>
          <div class="field span2">
            <label>摘要 *（llms.txt 与 meta description 复用）</label>
            <textarea v-model="form.summary" class="inp area" />
          </div>
          <div class="field">
            <label>作者署名（E-E-A-T）</label>
            <input v-model="form.authorName" class="inp" />
          </div>
          <div class="field">
            <label>模板</label>
            <input v-model="form.templateId" class="inp" />
          </div>
          <div class="field span2">
            <label>SEO 描述</label>
            <input v-model="form.seoDescription" class="inp" />
          </div>
          <div class="field span2">
            <label>关键字（逗号分隔）</label>
            <input v-model="form.seoKeywords" class="inp" />
          </div>
        </div>

        <div class="hd">
          <span class="panel-title"><TermHint term="blockStructured" /></span>
        </div>
        <div class="add">
          <el-button v-for="item in blockTypes" :key="item.type" size="small" @click="addBlock(item.type)">
            + {{ item.label }}
          </el-button>
        </div>
        <div class="body">
          <div v-for="(block, index) in form.blocks || []" :key="index" class="block">
            <div class="bhead">
              <span class="btype">{{
                blockTypes.find((b) => b.type === (block as any).type)?.label || (block as any).type
              }}</span>
              <el-button link size="small" type="danger" @click="removeBlock(index)">删除</el-button>
            </div>

            <template v-if="(block as any).type === 'hero'">
              <input v-model="(block as any).title" class="inp mb" placeholder="主标题" />
              <input v-model="(block as any).subtitle" class="inp" placeholder="副标题" />
            </template>

            <template v-else-if="(block as any).type === 'text'">
              <input v-model="(block as any).heading" class="inp mb" placeholder="小标题" />
              <div v-for="(p, pi) in (block as any).paragraphs" :key="pi" class="mb">
                <textarea v-model="(block as any).paragraphs[pi]" class="inp area" placeholder="段落内容" />
              </div>
              <el-button size="small" @click="addParagraph(block as any)">+ 段落</el-button>
            </template>

            <template v-else-if="(block as any).type === 'faq'">
              <div v-for="(faq, fi) in (block as any).items" :key="fi" class="faq">
                <input v-model="faq.question" class="inp mb" placeholder="问题" />
                <textarea v-model="faq.answer" class="inp area" placeholder="答案（简明直接，AI 易引用）" />
              </div>
              <el-button size="small" @click="addFaq(block as any)">+ 问答</el-button>
            </template>

            <template v-else-if="(block as any).type === 'contact'">
              <input v-model="(block as any).address" class="inp mb" placeholder="企业地址" />
              <input v-model="(block as any).phone" class="inp mb" placeholder="联系电话" />
              <input v-model="(block as any).email" class="inp" placeholder="邮箱" />
            </template>

            <template v-else>
              <p class="tip">图片列表：请在上传图片后按 fileId 维护（后续版本提供可视化选择器）</p>
            </template>
          </div>
          <p v-if="!(form.blocks || []).length" class="empty">
            尚未添加 Block，建议至少包含一个 FAQ Block 以提升 GEO 效果
          </p>
        </div>
      </div>

      <div class="panel side">
        <div class="hd">
          <span class="panel-title"><TermHint term="geoCheck" /></span>
        </div>
        <div class="body">
          <div v-if="geo" class="score">
            <span class="num mono" :class="geo.score >= 80 ? 'c-success' : geo.score >= 60 ? 'c-warning' : 'c-danger'">
              {{ geo.score }}
            </span>
            <span class="unit">/ 100</span>
          </div>
          <ul v-if="geo" class="issues">
            <li v-for="(issue, i) in geo.issues" :key="i" :class="issue.level">
              {{ issue.level === 'error' ? '必须处理' : '建议' }}：{{ issue.message }}
            </li>
            <li v-if="!geo.issues.length" class="ok">全部检查通过</li>
          </ul>
          <el-button v-if="!isNew" size="small" style="width: 100%" :loading="saving" @click="runCheck">
            重新体检
          </el-button>
          <p v-else class="tip">保存后即可体检</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .crumb {
    color: $c-text-faint;
    font-size: $font-size-xs;
  }

  .spacer {
    flex: 1;
  }

  .status-tag {
    padding: 0 6px;
    border: 1px solid $c-border;
    border-radius: 2px;
    background: $c-elevated;
    color: $c-text-sub;
    font-size: $font-size-xs;
    line-height: 18px;

    &.s-published {
      border-color: rgba($c-success, 0.45);
      color: $c-success;
    }

    &.s-pending_review {
      border-color: rgba($c-warning, 0.45);
      color: $c-warning;
    }
  }
}

.cols {
  display: flex;
  gap: $sp-2;
  align-items: flex-start;
}

.main {
  flex: 1;
  min-width: 0;
}

.side {
  width: 280px;
  flex-shrink: 0;
}

.panel {
  @include panel;
}

.hd {
  padding: 6px 10px;
  border-bottom: 1px solid $c-border-soft;
}

.body {
  padding: $sp-2;
}

.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $sp-2;
}

.span2 {
  grid-column: span 2;
}

.field label {
  display: block;
  font-size: $font-size-xs;
  color: $c-text-mute;
  margin-bottom: 4px;
}

.inp {
  width: 100%;
  box-sizing: border-box;
  background: $c-input;
  border: 1px solid $c-border;
  border-radius: $radius-md;
  padding: 6px 8px;
  color: $c-text;
  font-size: $font-size-sm;
  outline: none;

  &:focus {
    border-color: $c-primary;
  }
}

.area {
  min-height: 56px;
  resize: vertical;
}

.mb {
  margin-bottom: $sp-1;
}

.add {
  display: flex;
  gap: $sp-1;
  padding: $sp-1 $sp-2;
  flex-wrap: wrap;
  border-bottom: 1px solid $c-border-soft;
}

.block {
  border: 1px solid $c-border;
  border-radius: $radius-md;
  padding: $sp-1;
  margin-bottom: $sp-1;
}

.bhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $sp-1;
}

.btype {
  font-size: $font-size-xs;
  color: $c-accent;
}

.faq {
  margin-bottom: $sp-1;
}

.tip {
  color: $c-text-faint;
  font-size: $font-size-xs;
}

.empty {
  color: $c-text-faint;
  text-align: center;
  padding: $sp-2 0;
}

.score {
  display: flex;
  align-items: baseline;
  gap: 4px;

  .num {
    font-size: 24px;
    font-weight: 500;
  }

  .unit {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }
}

.issues {
  list-style: none;
  margin: $sp-1 0;
  padding: 0;

  li {
    font-size: $font-size-xs;
    margin-bottom: 6px;

    &.error {
      color: $c-danger;
    }

    &.warn {
      color: $c-warning;
    }

    &.ok {
      color: $c-success;
    }
  }
}
</style>
