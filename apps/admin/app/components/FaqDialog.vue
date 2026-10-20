<script setup lang="ts">
/**
 * 高频问答弹窗（新建 / 编辑）
 * 规范：弹窗一律独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新
 * 分类下拉可搜可建（allow-create），选项来自父页面传入的分类清单
 * 列表接口不返回答案，编辑打开时拉单条详情回显
 */
import { ElMessage } from 'element-plus'
import { newsFaqApi, type FaqItem } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 归属站点（父页面当前选中的站点） */
  siteId?: string
  /** 编辑对象；null 表示新建 */
  faq: FaqItem | null
  /** 站点下已有分类（父页面从分类接口加载，保存后由父页面刷新） */
  categories: string[]
}>()
const emit = defineEmits<{ saved: [] }>()

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由 `submit` 外层的 `debounce` 负责 */
const { loading: saving, run, isLoading, runKeyed } = useLoading()

const form = reactive({
  question: '',
  category: '',
  answer: ''
})

/** 编辑对象（打开后不再变化，供提交分支判断） */
const editing = computed(() => props.faq)

/** 每次打开重置表单；编辑时拉单条详情回显（列表行不含答案，按表记录 id 寻址） */
watch(visible, (open) => {
  if (!open) return
  form.question = props.faq?.question ?? ''
  form.category = props.faq?.category ?? ''
  form.answer = ''
  if (props.faq) {
    void runKeyed('detail', async () => {
      const detail = await newsFaqApi.faqDetail(props.faq!.id)
      form.question = detail.question ?? form.question
      form.category = detail.category ?? form.category
      form.answer = detail.answer ?? ''
    })
  }
})

/** 提交（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!props.siteId) {
    ElMessage.warning('请先选择站点')
    return
  }
  if (!form.question.trim()) {
    ElMessage.warning('请输入问题')
    return
  }
  if (!form.category.trim()) {
    ElMessage.warning('请选择或输入分类')
    return
  }

  const payload = {
    question: form.question.trim(),
    category: form.category.trim(),
    answer: form.answer
  }

  return run(async () => {
    if (editing.value) {
      await newsFaqApi.updateFaq(editing.value.id, payload)
    } else {
      await newsFaqApi.createFaq({ siteId: props.siteId!, ...payload })
    }
    ElMessage.success(editing.value ? '已保存，站点正在重新构建' : '已创建，站点正在重新构建')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="editing ? '编辑问答' : '新建问答'" width="720px" :close-on-click-modal="false">
    <el-form v-loading="isLoading('detail')" label-width="88px" size="small">
      <el-form-item label="问题" required>
        <el-input v-model="form.question" maxlength="120" placeholder="用户高频提出的问题" />
      </el-form-item>
      <el-form-item label="分类" required>
        <el-select
          v-model="form.category"
          filterable
          allow-create
          default-first-option
          placeholder="选择已有分类或输入新分类"
          style="width: 220px"
        >
          <el-option v-for="item in props.categories" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="答案">
        <PlainTextEditor v-model="form.answer" placeholder="请输入答案" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
