<script setup lang="ts">
/**
 * 案例弹窗（新建 / 编辑）
 * 规范：弹窗一律独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新
 * 两个页签：
 *   基础信息 —— 卡片字段（标题/行业/地点/面积/年份/使用体系/图片）+ 详情页头部（导语/标签/大图）
 *   详情内容 —— 项目信息行 / 案例正文 / 项目画面（均可空，留空则该区块不输出）
 * 列表接口不返回详情字段，编辑打开时拉单条详情回显
 */
import { ElMessage } from 'element-plus'
import { catalogApi, type CaseItem, type CasePayload } from '~/config/api'
import ImageField from './ImageField.vue'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** 项目信息行（详情页 glass-card） */
interface InfoRow {
  k: string
  v: string
  sub: string
}
/** 项目画面（详情页 env-grid） */
interface ImageRow {
  img: string
  caption: string
  note: string
  alt: string
}

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId?: string
  /** 编辑对象；null 表示新建 */
  item: CaseItem | null
}>()
const emit = defineEmits<{ saved: [] }>()

const { loading: saving, run, isLoading, runKeyed } = useLoading()
const activeTab = ref<'basic' | 'detail'>('basic')

const form = reactive({
  title: '',
  industry: '',
  location: '',
  area: '',
  year: '',
  system: '',
  img: '',
  lead: '',
  chipsText: '',
  bgImage: ''
})

const infoRows = ref<InfoRow[]>([])
const body = ref('')
const images = ref<ImageRow[]>([])

const editing = computed(() => props.item)

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
  form.industry = props.item?.industry ?? ''
  form.location = props.item?.location ?? ''
  form.area = props.item?.area ?? ''
  form.year = props.item?.year ?? ''
  form.system = props.item?.system ?? ''
  form.img = props.item?.img ?? ''
  form.lead = ''
  form.chipsText = ''
  form.bgImage = ''
  infoRows.value = []
  body.value = ''
  images.value = []

  if (!props.item) return
  void runKeyed('detail', async () => {
    const row = await catalogApi.caseDetail(props.item!.id)
    form.title = row.title ?? ''
    form.industry = row.industry ?? ''
    form.location = row.location ?? ''
    form.area = row.area ?? ''
    form.year = row.year ?? ''
    form.system = row.system ?? ''
    form.img = row.img ?? ''
    form.lead = row.lead ?? ''
    form.chipsText = (row.chips ?? []).join(', ')
    form.bgImage = row.bgImage ?? ''
    infoRows.value = (row.infoRows ?? []).map((item) => ({
      k: String(item.k ?? ''),
      v: String(item.v ?? ''),
      sub: String(item.sub ?? '')
    }))
    body.value = row.body ?? ''
    images.value = (row.images ?? []).map((item) => ({
      img: String(item.img ?? ''),
      caption: String(item.caption ?? ''),
      note: String(item.note ?? ''),
      alt: String(item.alt ?? '')
    }))
  })
})

/** 项目信息行：站点既有的业主/行业/地点/面积/体系字段一键带入（避免手工敲） */
function fillInfoRows() {
  const rows: InfoRow[] = []
  if (form.title.trim()) rows.push({ k: '项目', v: form.title.trim(), sub: '' })
  if (form.industry.trim()) rows.push({ k: '行业', v: form.industry.trim(), sub: '' })
  if (form.location.trim()) rows.push({ k: '地点', v: form.location.trim(), sub: '' })
  if (form.area.trim()) rows.push({ k: '地坪面积', v: form.area.trim(), sub: '' })
  if (form.system.trim()) rows.push({ k: '使用体系', v: form.system.trim(), sub: '' })
  infoRows.value = rows
}

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
    industry: form.industry.trim(),
    location: form.location.trim(),
    area: form.area.trim(),
    year: form.year.trim(),
    system: form.system.trim(),
    img: form.img.trim(),
    lead: form.lead.trim(),
    chips: splitList(form.chipsText),
    bgImage: form.bgImage.trim(),
    infoRows: infoRows.value.filter((item) => item.k.trim() || item.v.trim()),
    body: body.value,
    images: images.value.filter((item) => item.img.trim() || item.caption.trim())
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
  <el-dialog v-model="visible" :title="editing ? '编辑案例' : '新建案例'" width="880px" :close-on-click-modal="false">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基础信息" name="basic">
        <el-form v-loading="isLoading('detail')" label-width="96px" size="small">
          <el-form-item label="案例标题" required>
            <el-input v-model="form.title" maxlength="60" placeholder="如 海康威视 AGV 工厂" />
          </el-form-item>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="行业">
                <el-input v-model="form.industry" maxlength="40" placeholder="如 电子制造" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="项目地点">
                <el-input v-model="form.location" maxlength="40" placeholder="如 浙江杭州" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="8">
              <el-form-item label="地坪面积">
                <el-input v-model="form.area" maxlength="20" placeholder="如 35,000 ㎡" />
              </el-form-item>
            </el-col>
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
          </el-row>
          <el-form-item label="卡片图片">
            <ImageField v-model="form.img" source="案例 · 卡片图片" placeholder="/static/... 或点击上传" />
          </el-form-item>

          <el-divider content-position="left">详情页头部（留空则按卡片字段派生）</el-divider>
          <el-form-item label="导语">
            <el-input v-model="form.lead" type="textarea" :rows="2" maxlength="240" show-word-limit placeholder="详情页首屏导语" />
          </el-form-item>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="头部标签">
                <el-input v-model="form.chipsText" placeholder="逗号分隔，留空用面积/行业" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="头部大图">
                <ImageField v-model="form.bgImage" source="案例 · 详情大图" placeholder="留空用卡片图片" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="详情内容" name="detail">
        <div v-loading="isLoading('detail')" class="detail-pane">
          <p class="c-mute hint">以下区块均可留空：留空则详情页不输出该区块（含其小标题）。</p>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">项目信息</span>
              <div class="head-ops">
                <el-button link type="primary" size="small" @click="fillInfoRows">按卡片字段带入</el-button>
                <el-button link type="primary" size="small" @click="infoRows.push({ k: '', v: '', sub: '' })">
                  加一行
                </el-button>
              </div>
            </div>
            <div v-for="(item, index) in infoRows" :key="`ir-${index}`" class="row-item">
              <el-input v-model="item.k" placeholder="字段，如 业主" style="width: 120px" />
              <el-input v-model="item.v" placeholder="值，如 海康威视" style="width: 200px" />
              <el-input v-model="item.sub" placeholder="补充说明（可空）" />
              <el-button link type="danger" size="small" @click="infoRows.splice(index, 1)">删除</el-button>
            </div>
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">案例正文</span>
            </div>
            <PlainTextEditor v-model="body" placeholder="按段落书写：项目背景、使用的体系、施工范围与结果" :height="220" />
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">项目画面</span>
              <el-button
                link
                type="primary"
                size="small"
                @click="images.push({ img: '', caption: '', note: '', alt: '' })"
              >
                加一张
              </el-button>
            </div>
            <div v-for="(item, index) in images" :key="`im-${index}`" class="row-item">
              <ImageField v-model="item.img" source="案例 · 项目画面" placeholder="图片地址或上传" class="row-img" />
              <el-input v-model="item.caption" placeholder="图注" style="width: 160px" />
              <el-input v-model="item.note" placeholder="角标说明" style="width: 110px" />
              <el-button link type="danger" size="small" @click="images.splice(index, 1)">删除</el-button>
            </div>
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
  max-height: 52vh;
  overflow: auto;
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

.head-ops {
  display: flex;
  gap: $sp-1;
}

.block-title {
  font-weight: 500;
}

.row-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.img-field {
  display: flex;
  align-items: center;
  gap: $sp-1;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.img-preview {
  width: 64px;
  height: 40px;
  object-fit: cover;
  border-radius: 2px;
  flex: none;
}
</style>
