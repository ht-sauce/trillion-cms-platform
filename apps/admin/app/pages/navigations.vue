<script setup lang="ts">
/**
 * 导航管理：头部主导航 + 页脚四列（独立配置数据，**不从内容树推导**，见 ADR-029）
 * 每组分组内是可增删、可排序的条目：站内页面（el-select 取内容树页面）/ 外部链接（input）二选一
 * `invalid` 的条目（既无链接也无页面，或页面未发布）标黄提示；整组保存走 `PUT /navigations/:key`（全量覆盖）
 */
import { ElMessage } from 'element-plus'
import { editorApi, navigationsApi, sitesApi, type NavigationGroup } from '~/config/api'
import { NAVIGATION_TABS } from '~/config/menu'
import type { ContentTreeNode, NavigationKey, NavigationItemStatus } from '@trillion/shared'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** 可编辑条目（保存时按数组顺序即为 sort） */
interface EditableItem {
  label: string
  pageId: string | null
  href: string
  status: NavigationItemStatus
  /** 服务端回填的失效标记，用于标黄提示 */
  invalid: boolean
}

const { loading: saving, run } = useLoading()

const sites = ref<{ id: string; name: string }[]>([])
const siteId = ref<string>()
const groups = ref<NavigationGroup[]>([])
const activeKey = ref<NavigationKey>('header')
const loading = ref(false)

/** 各分组的编辑态：key → 条目数组（只在加载 / 保存成功时重置） */
const drafts = ref<Record<string, EditableItem[]>>({})
/** 页面候选（站内跳转下拉，取内容树里的页面节点） */
const pageOptions = ref<{ id: string; title: string; path: string }[]>([])

const currentItems = computed(() => drafts.value[activeKey.value] || [])

const route = useRoute()

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  /** 从站点列表「导航」入口进来时带 siteId，否则落到第一个站点 */
  const fromQuery = String(route.query.siteId || '')
  siteId.value = fromQuery || sites.value[0]?.id
}

/** 从内容树收集全部页面（导航只指向页面，不指向目录） */
function collectPages(nodes: ContentTreeNode[]): { id: string; title: string; path: string }[] {
  const result: { id: string; title: string; path: string }[] = []
  const walk = (list: ContentTreeNode[]) => {
    for (const node of list) {
      if (node.type === 'page') result.push({ id: node.id, title: node.name, path: node.path })
      walk(node.children || [])
    }
  }
  walk(nodes)
  return result
}

async function load() {
  if (!siteId.value) return
  loading.value = true
  try {
    const [list, tree] = await Promise.all([
      navigationsApi.list(siteId.value),
      editorApi.tree(siteId.value).catch(() => null)
    ])
    groups.value = list
    pageOptions.value = tree ? collectPages(tree.nodes) : []
    resetDrafts()
    if (!list.some((group) => group.key === activeKey.value)) activeKey.value = list[0]?.key ?? 'header'
  } finally {
    loading.value = false
  }
}

/** 用服务端数据重置编辑态（整组全量覆盖，所以每次都以服务端为准） */
function resetDrafts() {
  const next: Record<string, EditableItem[]> = {}
  for (const group of groups.value) {
    next[group.key] = group.items.map((item) => ({
      label: item.label,
      pageId: item.pageId,
      href: item.href || '',
      status: item.status,
      invalid: Boolean(item.invalid)
    }))
  }
  drafts.value = next
}

const tabs = computed(() =>
  NAVIGATION_TABS.map((tab) => ({
    key: tab.key as NavigationKey,
    title: tab.title,
    count: (drafts.value[tab.key] || []).length
  }))
)

function addItem() {
  const list = [...currentItems.value, { label: '', pageId: null, href: '', status: 'active' as const, invalid: false }]
  drafts.value = { ...drafts.value, [activeKey.value]: list }
}

function removeItem(index: number) {
  const list = [...currentItems.value]
  list.splice(index, 1)
  drafts.value = { ...drafts.value, [activeKey.value]: list }
}

function moveItem(index: number, direction: 'up' | 'down') {
  const list = [...currentItems.value]
  const target = direction === 'up' ? index - 1 : index + 1
  const current = list[index]
  const swapped = list[target]
  if (target < 0 || target >= list.length || !current || !swapped) return
  list[index] = swapped
  list[target] = current
  drafts.value = { ...drafts.value, [activeKey.value]: list }
}

/** 条目是否被判定为失效（保存前本地即时反馈：既无站内页面也无外部链接） */
function isInvalid(item: EditableItem): boolean {
  return item.invalid || (!item.pageId && !item.href.trim())
}

/** 保存当前分组（防抖在外、loading 在内）：整组全量覆盖 */
const onSave = debounce(
  () =>
    run(async () => {
      if (!siteId.value) return
      const items = currentItems.value
      if (items.some((item) => !item.label.trim())) {
        ElMessage.warning('请先填写每个导航项的链接文案')
        return
      }
      await navigationsApi.save(activeKey.value, {
        siteId: siteId.value,
        items: items.map((item) => ({
          label: item.label.trim(),
          pageId: item.pageId ?? null,
          href: item.href.trim() || null,
          status: item.status
        }))
      })
      ElMessage.success('导航已保存')
      await load()
    }),
  DEBOUNCE_WAIT
)

watch(siteId, load)
onMounted(async () => {
  await loadSites()
  await load()
})
</script>

<template>
  <div v-loading="loading" class="page-wrap">
    <div class="bar">
      <span class="panel-title"><TermHint term="navManager" /></span>
      <el-select v-model="siteId" placeholder="选择站点" style="width: 200px">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <span class="spacer" />
      <el-button size="small" @click="load">刷新</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="onSave">保存</el-button>
    </div>

    <el-tabs v-model="activeKey" class="nav-tabs">
      <el-tab-pane v-for="tab in tabs" :key="tab.key" :name="tab.key">
        <template #label>
          <span>{{ tab.title }}（{{ tab.count }}）</span>
        </template>

        <el-table :data="currentItems" border size="small" style="width: 100%" empty-text="该分组暂无导航项">
          <el-table-column label="#" width="50">
            <template #default="{ $index }">
              <span class="mono">{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="链接文案" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.label" maxlength="64" placeholder="如：诊疗项目" />
            </template>
          </el-table-column>
          <el-table-column min-width="200">
            <template #header><TermHint term="navPage" /></template>
            <template #default="{ row }">
              <el-select v-model="row.pageId" clearable filterable placeholder="选择页面" style="width: 100%">
                <el-option
                  v-for="item in pageOptions"
                  :key="item.id"
                  :label="`${item.title}（${item.path}）`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column min-width="200">
            <template #header><TermHint term="navHref" /></template>
            <template #default="{ row }">
              <el-input v-model="row.href" maxlength="512" placeholder="如：https://example.com" />
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.status" active-value="active" inactive-value="disabled" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" class-name="ops-col">
            <template #default="{ $index }">
              <el-button link size="small" :disabled="$index === 0" @click="moveItem($index, 'up')">上移</el-button>
              <el-button
                link
                size="small"
                :disabled="$index === currentItems.length - 1"
                @click="moveItem($index, 'down')"
              >
                下移
              </el-button>
              <el-button link size="small" type="danger" @click="removeItem($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <p v-if="currentItems.some(isInvalid)" class="invalid-tip">
          存在失效导航项（既无站内页面也无外部链接，或页面未发布）：站点渲染时会剔除，不会出现在页面上。
        </p>

        <div class="foot">
          <el-button size="small" @click="addItem">+ 添加导航项</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .spacer {
    flex: 1;
  }
}

.invalid-tip {
  margin: $sp-1 0 0;
  color: $c-warning;
  font-size: $font-size-xs;
}

.foot {
  display: flex;
  padding-top: $sp-1;
}
</style>
