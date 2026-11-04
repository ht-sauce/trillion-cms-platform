<script setup lang="ts">
/**
 * 产品弹窗（新建 / 编辑）
 * 规范：弹窗一律独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新
 * 两个页签：
 *   基础信息 —— 卡片字段（名称/中文名/系列/行业分组/标签/图片/说明）+ 详情页头部（导语/标签/大图）
 *   详情内容 —— 系统说明 / 系统构造 / 系统特点 / 标准色卡 / 常见问题（均可空，留空则该区块不输出）
 * 列表接口不返回详情字段，编辑打开时拉单条详情回显
 */
import { ElMessage } from 'element-plus'
import { catalogApi, type ProductIndustryItem, type ProductItem, type ProductPayload } from '~/config/api'
import ImageField from './ImageField.vue'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** 系统说明行 */
interface IntroRow {
  k: string
  v: string
}
/** 系统构造分层 */
interface LayerRow {
  role: string
  product: string
  thickness: string
  desc: string
  code: string
}
/** 系统特点 */
interface FeatureRow {
  title: string
  desc: string
  icon: string
}
/** 色卡 */
interface ColorRow {
  name: string
  hex: string
}
/** 产品常见问题 */
interface FaqRow {
  q: string
  a: string
}

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 归属站点（父页面当前选中的站点） */
  siteId?: string
  /** 编辑对象；null 表示新建 */
  product: ProductItem | null
  /** 站点下的行业分组（分组归属多选） */
  industries: ProductIndustryItem[]
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run, isLoading, runKeyed } = useLoading()

const activeTab = ref<'basic' | 'detail'>('basic')

/** 基础信息表单（标签/头部标签用逗号分隔字符串填写，提交时拆数组） */
const form = reactive({
  name: '',
  cnName: '',
  series: '',
  industries: [] as string[],
  desc: '',
  img: '',
  tagsText: '',
  lead: '',
  chipsText: '',
  bgImage: ''
})

/** 详情内容表单（空数组 = 该区块不输出） */
const systemIntro = ref<IntroRow[]>([])
const layers = ref<LayerRow[]>([])
const features = ref<FeatureRow[]>([])
const colors = ref<ColorRow[]>([])
const faqs = ref<FaqRow[]>([])

/** 编辑对象（打开后不再变化，供提交分支判断） */
const editing = computed(() => props.product)

/** 逗号分隔字符串 → 数组（支持中英文逗号） */
function splitList(text: string): string[] {
  return String(text ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 每次打开重置表单；编辑时拉单条详情回显（列表行不含详情字段） */
watch(visible, (open) => {
  if (!open) return
  activeTab.value = 'basic'
  form.name = props.product?.name ?? ''
  form.cnName = props.product?.cnName ?? ''
  form.series = props.product?.series ?? ''
  form.industries = [...(props.product?.industries ?? [])]
  form.desc = props.product?.desc ?? ''
  form.img = props.product?.img ?? ''
  form.tagsText = (props.product?.tags ?? []).join(', ')
  form.lead = ''
  form.chipsText = ''
  form.bgImage = ''
  systemIntro.value = []
  layers.value = []
  features.value = []
  colors.value = []
  faqs.value = []

  if (!props.product) return
  void runKeyed('detail', async () => {
    const row = await catalogApi.productDetail(props.product!.id)
    form.name = row.name ?? ''
    form.cnName = row.cnName ?? ''
    form.series = row.series ?? ''
    form.industries = [...(row.industries ?? [])]
    form.desc = row.desc ?? ''
    form.img = row.img ?? ''
    form.tagsText = (row.tags ?? []).join(', ')
    form.lead = row.lead ?? ''
    form.chipsText = (row.chips ?? []).join(', ')
    form.bgImage = row.bgImage ?? ''
    systemIntro.value = (row.systemIntro ?? []).map((item) => ({ k: item.k ?? '', v: item.v ?? '' }))
    layers.value = (row.layers ?? []).map((item) => ({
      role: String(item.role ?? ''),
      product: String(item.product ?? ''),
      thickness: String(item.thickness ?? ''),
      desc: String(item.desc ?? ''),
      code: String(item.code ?? '')
    }))
    features.value = (row.features ?? []).map((item) => ({
      title: String(item.title ?? ''),
      desc: String(item.desc ?? ''),
      icon: String(item.icon ?? '')
    }))
    colors.value = (row.colors ?? []).map((item) => ({
      name: String(item.name ?? ''),
      hex: String(item.hex ?? '')
    }))
    faqs.value = (row.faqs ?? []).map((item) => ({ q: item.q ?? '', a: item.a ?? '' }))
  })
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入产品名称')
    return
  }
  if (!form.industries.length) {
    ElMessage.warning('请至少选择一个行业分组（决定产品在 /products 页的位置）')
    return
  }

  const payload: ProductPayload = {
    name: form.name.trim(),
    cnName: form.cnName.trim(),
    series: form.series.trim(),
    industries: form.industries,
    desc: form.desc.trim(),
    img: form.img.trim(),
    tags: splitList(form.tagsText),
    lead: form.lead.trim(),
    chips: splitList(form.chipsText),
    bgImage: form.bgImage.trim(),
    systemIntro: systemIntro.value.filter((item) => item.k.trim() || item.v.trim()),
    layers: layers.value.filter((item) => item.role.trim() || item.product.trim() || item.desc.trim()),
    features: features.value.filter((item) => item.title.trim() || item.desc.trim()),
    colors: colors.value.filter((item) => item.name.trim() || item.hex.trim()),
    faqs: faqs.value.filter((item) => item.q.trim() || item.a.trim())
  }

  return run(async () => {
    if (editing.value) {
      await catalogApi.updateProduct(editing.value.id, payload)
    } else {
      await catalogApi.createProduct({ siteId: props.siteId!, ...payload })
    }
    ElMessage.success(editing.value ? '已保存，站点正在重新构建' : '已创建，站点正在重新构建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editing ? '编辑产品' : '新建产品'" width="880px" :close-on-click-modal="false">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基础信息" name="basic">
        <el-form v-loading="isLoading('detail')" label-width="96px" size="small">
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="产品名称" required>
                <el-input v-model="form.name" maxlength="60" placeholder="如 ForinCrete SL" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="中文名称">
                <el-input v-model="form.cnName" maxlength="60" placeholder="如 聚氨酯砂浆自流平" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="树脂系列">
                <el-input v-model="form.series" maxlength="60" placeholder="如 ForinCrete（第二种分类维度）" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="行业分组" required>
                <el-select v-model="form.industries" multiple collapse-tags placeholder="可多选" style="width: 100%">
                  <el-option v-for="item in props.industries" :key="item.id" :label="item.name" :value="item.name" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="卡片说明">
            <el-input
              v-model="form.desc"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="一句话说明这套体系用在哪（列表卡片描述）"
            />
          </el-form-item>
          <el-form-item label="特性标签">
            <el-input v-model="form.tagsText" placeholder="用逗号分隔，如：耐冲洗, 耐腐蚀" />
          </el-form-item>
          <el-form-item label="卡片图片">
            <ImageField v-model="form.img" placeholder="/static/... 或点击上传" />
          </el-form-item>

          <el-divider content-position="left">详情页头部（留空则回落卡片字段）</el-divider>
          <el-form-item label="导语">
            <el-input
              v-model="form.lead"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="详情页首屏导语，留空用卡片说明"
            />
          </el-form-item>
          <el-row :gutter="8">
            <el-col :span="12">
              <el-form-item label="头部标签">
                <el-input v-model="form.chipsText" placeholder="逗号分隔，留空用特性标签" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="头部大图">
                <ImageField v-model="form.bgImage" placeholder="留空用卡片图片" />
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
              <span class="block-title">系统说明</span>
              <el-button link type="primary" size="small" @click="systemIntro.push({ k: '', v: '' })">加一条</el-button>
            </div>
            <div v-for="(item, index) in systemIntro" :key="`si-${index}`" class="row-item">
              <el-input v-model="item.k" placeholder="小标题，如 系统构成" style="width: 160px" />
              <el-input v-model="item.v" type="textarea" :rows="2" placeholder="说明内容" />
              <el-button link type="danger" size="small" @click="systemIntro.splice(index, 1)">删除</el-button>
            </div>
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">系统构造（自上而下）</span>
              <el-button
                link
                type="primary"
                size="small"
                @click="layers.push({ role: '', product: '', thickness: '', desc: '', code: '' })"
              >
                加一层
              </el-button>
            </div>
            <div v-for="(item, index) in layers" :key="`ly-${index}`" class="row-item">
              <el-input v-model="item.role" placeholder="层位，如 面漆" style="width: 100px" />
              <el-input v-model="item.product" placeholder="材料，如 ForinShield SL" style="width: 180px" />
              <el-input v-model="item.thickness" placeholder="厚度" style="width: 90px" />
              <el-input v-model="item.desc" placeholder="作用说明" />
              <el-button link type="danger" size="small" @click="layers.splice(index, 1)">删除</el-button>
            </div>
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">系统特点</span>
              <el-button
                link
                type="primary"
                size="small"
                @click="features.push({ title: '', desc: '', icon: '' })"
              >
                加一条
              </el-button>
            </div>
            <div v-for="(item, index) in features" :key="`ft-${index}`" class="row-item">
              <el-input v-model="item.title" placeholder="特点，如 耐磨抗冲击" style="width: 140px" />
              <el-input v-model="item.icon" placeholder="图标字" style="width: 90px" />
              <el-input v-model="item.desc" placeholder="说明" />
              <el-button link type="danger" size="small" @click="features.splice(index, 1)">删除</el-button>
            </div>
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">标准色卡</span>
              <el-button link type="primary" size="small" @click="colors.push({ name: '', hex: '' })">加一色</el-button>
            </div>
            <div v-for="(item, index) in colors" :key="`cl-${index}`" class="row-item">
              <el-input v-model="item.name" placeholder="颜色名，如 浅灰" style="width: 140px" />
              <el-input v-model="item.hex" placeholder="#CED0CF" style="width: 120px" />
              <span class="swatch" :style="{ background: item.hex || 'transparent' }" />
              <el-button link type="danger" size="small" @click="colors.splice(index, 1)">删除</el-button>
            </div>
          </section>

          <section class="detail-block">
            <div class="block-head">
              <span class="block-title">产品常见问题</span>
              <el-button link type="primary" size="small" @click="faqs.push({ q: '', a: '' })">加一问</el-button>
            </div>
            <div v-for="(item, index) in faqs" :key="`fq-${index}`" class="faq-item">
              <el-input v-model="item.q" placeholder="问题" />
              <el-input v-model="item.a" type="textarea" :rows="2" placeholder="答案" />
              <el-button link type="danger" size="small" @click="faqs.splice(index, 1)">删除</el-button>
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

.block-title {
  font-weight: 500;
}

.row-item,
.faq-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.faq-item {
  .el-input,
  .el-textarea {
    flex: 1;
  }
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

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 2px;
  border: 1px solid var(--el-border-color);
  flex: none;
  margin-top: 2px;
}
</style>
