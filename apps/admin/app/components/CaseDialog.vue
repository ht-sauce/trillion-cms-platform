<script setup lang="ts">
/**
 * 案例弹窗（新建 / 编辑）
 * 规范：弹窗一律独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新
 * 两个页签：
 *   基础信息 —— 卡片字段（标题/行业/业主/地点/面积/年份/使用体系/图片）+ 详情页头部（导语/标签/大图）
 * 行业只能下拉选择行业分类（ProductIndustry），不允许自由输入；项目信息行由服务端按字段派生。
 * 列表接口不返回详情字段，编辑打开时拉单条详情回显。正文纯文本列由服务端从 HTML 派生。
 */
import { ElMessage } from 'element-plus'
import { catalogApi, type CaseItem, type CasePayload, type ProductIndustryItem } from '~/config/api'
import ImageField from './ImageField.vue'
import NewsBodyEditor from './NewsBodyEditor.vue'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId?: string
  /** 编辑对象；null 表示新建 */
  item: CaseItem | null
  /** 行业分类选项（父页面与筛选下拉共用同一份 catalogApi.industries 数据） */
  industries: ProductIndustryItem[]
}>()
const emit = defineEmits<{ saved: [] }>()

const { loading: saving, run, isLoading, runKeyed } = useLoading()
const activeTab = ref<'basic' | 'detail'>('basic')

const form = reactive({
  title: '',
  industryId: '',
  client: '',
  location: '',
  area: '',
  year: '',
  system: '',
  systemNote: '',
  img: '',
  lead: '',
  chipsText: '',
  bgImage: ''
})

const bodyHtml = ref('')

const editing = computed(() => props.item)

/** 素材上传来源标签（标题未填时用通用文案） */
const editorSource = computed(() => `案例正文 · ${form.title.trim() || '工程案例'}`)

/** 逗号分隔字符串 → 数组（支持中英文逗号） */
function splitList(text: string): string[] {
  return String(text ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

watch(visible, (open) => {
  if (!open) return
  activeTab.value = 'basic'
  form.title = props.item?.title ?? ''
  form.industryId = props.item?.industryId ?? ''
  form.client = props.item?.client ?? ''
  form.location = props.item?.location ?? ''
  form.area = props.item?.area ?? ''
  form.year = props.item?.year ?? ''
  form.system = props.item?.system ?? ''
  form.systemNote = ''
  form.img = props.item?.img ?? ''
  form.lead = ''
  form.chipsText = ''
  form.bgImage = ''
  bodyHtml.value = ''

  if (!props.item) return
  void runKeyed('detail', async () => {
    const row = await catalogApi.caseDetail(props.item!.id)
    form.title = row.title ?? ''
    form.industryId = row.industryId ?? ''
    form.client = row.client ?? ''
    form.location = row.location ?? ''
    form.area = row.area ?? ''
    form.year = row.year ?? ''
    form.system = row.system ?? ''
    form.systemNote = row.systemNote ?? ''
    form.img = row.img ?? ''
    form.lead = row.lead ?? ''
    form.chipsText = (row.chips ?? []).join(', ')
    form.bgImage = row.bgImage ?? ''
    bodyHtml.value = row.bodyHtml ?? ''
  })
})

const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.title.trim()) {
    ElMessage.warning('请输入案例标题')
    return
  }

  const payload: CasePayload = {
    title: form.title.trim(),
    industryId: form.industryId,
    client: form.client.trim(),
    location: form.location.trim(),
    area: form.area.trim(),
    year: form.year.trim(),
    system: form.system.trim(),
    systemNote: form.systemNote.trim(),
    img: form.img.trim(),
    lead: form.lead.trim(),
    chips: splitList(form.chipsText),
    bgImage: form.bgImage.trim(),
    bodyHtml: bodyHtml.value
  }

  return run(async () => {
    if (editing.value) {
      await catalogApi.updateCase(editing.value.id, payload)
    } else {
      await catalogApi.createCase({ siteId: props.siteId!, ...payload })
    }
    ElMessage.success(editing.value ? '已保存，站点正在重新构建' : '已创建，站点正在重新构建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="editing ? '编辑案例' : '新建案例'"
    width="880px"
    top="3vh"
    class="case-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基础信息" name="basic">
        <el-form v-loading="isLoading('detail')" label-width="96px" size="small">
          <el-form-item label="案例标题" required>
            <el-input v-model="form.title" maxlength="60" placeholder="如 海康威视 AGV 工厂" />
          </el-form-item>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="行业">
                <el-select
                  v-model="form.industryId"
                  filterable
                  clearable
                  placeholder="选择行业分类"
                  style="width: 100%"
                >
                  <el-option
                    v-for="industry in industries"
                    :key="industry.id"
                    :label="industry.name"
                    :value="industry.id"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="业主">
                <el-input v-model="form.client" maxlength="80" placeholder="如 海康威视" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="项目地点">
                <el-input v-model="form.location" maxlength="40" placeholder="如 浙江杭州" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="地坪面积">
                <el-input v-model="form.area" maxlength="20" placeholder="如 35,000 ㎡" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="8">
              <el-form-item label="完成年份">
                <el-input v-model="form.year" maxlength="10" placeholder="如 2022" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="使用体系">
                <el-input v-model="form.system" maxlength="60" placeholder="如 ForinCrete SL-ESD" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="体系备注">
                <el-input v-model="form.systemNote" maxlength="60" placeholder="副项，如 重载耐化学" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="卡片图片">
            <ImageField v-model="form.img" source="案例 · 卡片图片" placeholder="/static/... 或点击上传" />
          </el-form-item>

          <el-divider content-position="left">详情页头部（留空则不展示）</el-divider>
          <el-form-item label="导语">
            <el-input
              v-model="form.lead"
              type="textarea"
              :rows="2"
              maxlength="240"
              show-word-limit
              placeholder="详情页首屏导语"
            />
          </el-form-item>
          <el-form-item label="头部标签">
            <el-input v-model="form.chipsText" placeholder="逗号分隔，留空不展示" />
          </el-form-item>
          <el-form-item label="头部大图">
            <ImageField
              v-model="form.bgImage"
              source="案例 · 详情大图"
              placeholder="留空则使用卡片图片，也可填入其它素材库地址"
            >
              <template #action>
                <el-button size="small" :disabled="!form.img" @click="form.bgImage = form.img">用卡片图片</el-button>
              </template>
            </ImageField>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="详情内容" name="detail" lazy>
        <div v-loading="isLoading('detail')" class="detail-pane">
          <p class="c-mute hint">以下区块均可留空：留空则详情页不输出该区块（含其小标题）。</p>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">案例正文</span>
              <span class="c-mute hint">支持图片 / 视频 / 表格，图片与视频上传到素材库</span>
            </div>
            <NewsBodyEditor v-model="bodyHtml" :source="editorSource" :height="480" />
          </section>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.detail-pane {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
}

.hint {
  margin: 0;
  font-size: 12px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.block-title {
  font-weight: 500;
}
</style>

<style lang="scss">
/** 弹窗内容超出视口时只在弹窗体内部滚动（顶部 top=3vh，留出头部与底部按钮）
 *  弹窗被 teleport 到 body，拿不到 scoped 属性，故用全局块 + 专属类名限定作用域 */
.case-dialog .el-dialog__body {
  max-height: calc(100vh - 190px);
  overflow: auto;
}
</style>
