<script setup lang="ts">
/**
 * 关联问题弹窗（ADR-057）
 *
 * 详情页底部的「关联问题」（faq-list 块）默认取「同分类其它问答前 8 条」，
 * 分类里问答一多就没法决定露出哪几条。这里让运营手工挑选并排序：
 *   左：候选问答（关键词搜索 + 分类筛选 + 分页）
 *   右：已选（上移 / 下移 / 移除）
 *   保存空数组 = 恢复「同分类其它问答」自动口径。
 *
 * 规范：弹窗独立组件，defineModel 控显隐、emit('saved') 通知父页面刷新。
 */
import { ElMessage } from 'element-plus'
import { newsFaqApi, type FaqItem } from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 归属站点 */
  siteId?: string
  /** 当前问答（null = 未打开，不渲染内容） */
  faq: FaqItem | null
  /** 站点下已有分类（候选筛选下拉） */
  categories: string[]
}>()
const emit = defineEmits<{ saved: [] }>()

const { loading: saving, isLoading, run, runKeyed } = useLoading()

/** 已选（保持顺序，右侧列表直接用） */
const selected = ref<{ id: string; question: string; category: string }[]>([])
/** 当前是否走自动口径（服务端回显） */
const auto = ref(true)

/** 候选列表 */
const candidates = ref<FaqItem[]>([])
const total = ref(0)
const keyword = ref('')
const category = ref('')
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

/** 已选 id 集合（候选列表勾选态） */
const selectedIds = computed(() => new Set(selected.value.map((item) => item.id)))

/** 最多关联条数（与服务端 RELATED_FAQ_MAX 一致） */
const MAX_RELATED = 8

/** 打开时载入已选 + 候选首页（`useLoading` 同一实例内动作互斥，必须串行调用，否则第二个请求会被吞掉） */
watch(visible, (open) => {
  if (!open || !props.faq) return
  keyword.value = ''
  category.value = ''
  page.value = 1
  selected.value = []
  auto.value = true
  void (async () => {
    await loadRelated()
    await loadCandidates()
  })()
})

async function loadRelated() {
  if (!props.faq) return
  await runKeyed('related', async () => {
    const info = await newsFaqApi.getFaqRelated(props.faq!.id)
    auto.value = info.auto
    selected.value = info.items.map((item) => ({ id: item.id, question: item.question, category: item.category }))
  })
}

async function loadCandidates() {
  if (!props.siteId || !props.faq) return
  await runKeyed('candidates', async () => {
    const result = await newsFaqApi.faqList({
      siteId: props.siteId!,
      keyword: keyword.value || undefined,
      category: category.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    /** 排除自身：关联自己无意义 */
    candidates.value = result.list.filter((row) => row.id !== props.faq!.id)
    total.value = result.total - (result.list.length !== candidates.value.length ? 1 : 0)
  })
}

function toggle(row: FaqItem) {
  if (selectedIds.value.has(row.id)) {
    remove(row.id)
    return
  }
  if (selected.value.length >= MAX_RELATED) {
    ElMessage.warning(`最多关联 ${MAX_RELATED} 条问题`)
    return
  }
  selected.value = [...selected.value, { id: row.id, question: row.question, category: row.category }]
}

function remove(id: string) {
  selected.value = selected.value.filter((item) => item.id !== id)
}

/** 上移 / 下移（顺序即详情页展示顺序） */
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= selected.value.length) return
  const next = [...selected.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  selected.value = next
}

const applyFilter = debounce(() => {
  page.value = 1
  void loadCandidates()
}, DEBOUNCE_WAIT)

/** 保存（防抖在外、loading 在内） */
const submit = debounce(() => {
  if (!props.faq) return
  return run(async () => {
    await newsFaqApi.setFaqRelated(
      props.faq!.id,
      selected.value.map((item) => item.id)
    )
    ElMessage.success(selected.value.length ? '关联问题已保存，站点正在重新构建' : '已恢复自动关联（同分类其它问答）')
    visible.value = false
    emit('saved')
  })
}, DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" title="关联问题" width="920px" :close-on-click-modal="false">
    <div v-loading="isLoading('related')" class="rel">
      <section class="panel">
        <header class="panel-head">
          <span class="panel-title">候选问题</span>
          <el-input
            v-model="keyword"
            size="small"
            placeholder="搜索问题"
            clearable
            style="width: 180px"
            @keyup.enter="applyFilter"
            @clear="applyFilter"
          />
          <el-select
            v-model="category"
            size="small"
            placeholder="全部分类"
            clearable
            style="width: 140px"
            @change="applyFilter"
          >
            <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
          </el-select>
        </header>

        <div v-loading="isLoading('candidates')" class="list">
          <button
            v-for="row in candidates"
            :key="row.id"
            type="button"
            class="row"
            :class="{ on: selectedIds.has(row.id) }"
            @click="toggle(row)"
          >
            <span class="q">{{ row.question }}</span>
            <span class="cat">{{ row.category }}</span>
          </button>
          <p v-if="!candidates.length" class="empty">没有匹配的问答</p>
        </div>

        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="PAGE_SIZE_OPTIONS"
            :layout="PAGINATION_LAYOUT"
            small
            @current-change="loadCandidates"
            @size-change="loadCandidates"
          />
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">
          <span class="panel-title">已选（{{ selected.length }}/{{ MAX_RELATED }}）</span>
          <el-tag v-if="auto && !selected.length" size="small" type="info" effect="plain">当前为自动关联</el-tag>
        </header>

        <div class="list">
          <div v-for="(item, index) in selected" :key="item.id" class="row picked">
            <span class="idx mono">{{ index + 1 }}</span>
            <span class="q">{{ item.question }}</span>
            <span class="ops">
              <el-button link size="small" :disabled="index === 0" @click="move(index, -1)">↑</el-button>
              <el-button link size="small" :disabled="index === selected.length - 1" @click="move(index, 1)"
                >↓</el-button
              >
              <el-button link size="small" type="danger" @click="remove(item.id)">移除</el-button>
            </span>
          </div>
          <p v-if="!selected.length" class="empty">
            未选任何问答：保存后按「同分类其它问答」自动取前 {{ MAX_RELATED }} 条
          </p>
        </div>
      </section>
    </div>

    <template #footer>
      <span class="foot-tip">顺序即详情页的展示顺序</span>
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.rel {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: $sp-2;
  min-height: 380px;
}

.panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: $sp-1;
  padding: $sp-1;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.panel-title {
  font-weight: 600;
  margin-right: auto;
}

/**
 * 筛选控件尺寸由 main.scss 的组件库覆盖层统一（ADR-059 配套），这里不再单独补高度；
 * 宽度沿用列表页筛选栏口径（搜索 180 / 分类 140），两栏观感一致。
 */

.list {
  flex: 1;
  overflow-y: auto;
  max-height: 380px;
  padding: $sp-1;
}

.row {
  display: flex;
  align-items: center;
  gap: $sp-1;
  width: 100%;
  padding: 6px $sp-1;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  text-align: left;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  &.on {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  &.picked {
    cursor: default;
  }

  .q {
    flex: 1;
    line-height: 1.6;
  }

  .cat {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .idx {
    width: 18px;
    flex-shrink: 0;
    color: var(--el-text-color-secondary);
  }

  .ops {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
}

.empty {
  padding: $sp-2 $sp-1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 4px $sp-1;
  border-top: 1px solid var(--el-border-color-lighter);
}

.foot-tip {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
