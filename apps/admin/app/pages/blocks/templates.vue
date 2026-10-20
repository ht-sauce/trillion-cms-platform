<script setup lang="ts">
/**
 * 块模板库（公共模板，平台级）
 *
 * 定位（09 §4.5）：公共块只是**模板**，不会直接被任何站点渲染。
 * 站点首次引用某模板时会自动复制一份成本站自有块；此后再改模板**不影响已引入的站点**，
 * 只影响「之后新引入」的站点——因此这里改代码是安全的，但仍需平台级角色。
 *
 * 站点侧查看 / 引入模板见「块库」（内容 / 页面 → 块库）。
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { PUBLIC_BLOCK_SITE_ID, blocksApi, type BlockListItem } from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading：行级动作（回退）用 keyed；防抖由动作外层的 `debounce` 负责 */
const { isLoading, runKeyed } = useLoading()

/** window.open 不经路由、不会自动带 /geocms/ 基础路径，新标签页地址统一用 router.resolve 取带前缀的 href */
const router = useRouter()

const list = ref<BlockListItem[]>([])
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)
const keyword = ref('')
const loading = ref(false)
const createDialog = ref(false)

/** 模板库量级在百级，不做服务端分页，前端按默认 20 条分页展示 */
const filteredList = computed(() => {
  const key = keyword.value.trim()
  if (!key) return list.value
  return list.value.filter((item) => item.name.includes(key) || item.key.includes(key) || item.hint.includes(key))
})

const total = computed(() => filteredList.value.length)

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

async function load() {
  loading.value = true
  try {
    list.value = await blocksApi.list(PUBLIC_BLOCK_SITE_ID)
    page.value = 1
  } finally {
    loading.value = false
  }
}

/** 打开模板代码页：新标签页打开，避免返回列表时丢现场 */
function openCode(row: BlockListItem) {
  window.open(router.resolve(`/blocks/${row.key}?siteId=${PUBLIC_BLOCK_SITE_ID}`).href, '_blank', 'noopener,noreferrer')
}

const onRollback = debounce(
  (row: BlockListItem) =>
    runKeyed(`rollback:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(
          `确认将模板「${row.name}」回退到上一版？当前版本 v${row.version}，回退后版本仍自增且可继续回退。` +
            '已引入该模板的站点不受影响。',
          '回退确认',
          { type: 'warning' }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await blocksApi.rollback(row.key, PUBLIC_BLOCK_SITE_ID)
      ElMessage.success('已回退上一版')
      await load()
    }),
  DEBOUNCE_WAIT
)

onMounted(load)
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">块模板</span>
      <el-input v-model="keyword" placeholder="搜索模板名 / 标识 / 用途" style="width: 220px" @keyup.enter="page = 1" />
      <span class="spacer" />
      <el-button size="small" @click="load">刷新</el-button>
      <el-button type="primary" size="small" @click="createDialog = true">新建模板</el-button>
    </div>

    <p class="tip">
      模板只在站点「首次引入」时提供初始代码；改模板不影响已引入的站点，只影响之后新引入的站点。站点侧的引入与维护见「块库」。
    </p>

    <el-table v-loading="loading" :data="pagedList" border size="small" style="width: 100%" empty-text="暂无模板">
      <el-table-column prop="name" label="模板名" min-width="140" show-overflow-tooltip />
      <el-table-column min-width="140">
        <template #header><TermHint term="blockKey" /></template>
        <template #default="{ row }">
          <span class="mono">{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="hint" label="用途" min-width="200" show-overflow-tooltip />
      <el-table-column label="字段数" width="80">
        <template #default="{ row }">
          <span class="mono">{{ row.fieldCount }}</span>
        </template>
      </el-table-column>
      <el-table-column width="90">
        <template #header><TermHint term="blockVersion" /></template>
        <template #default="{ row }">
          <span class="mono">v{{ row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column min-width="220">
        <template #header><TermHint term="compileStatus" /></template>
        <template #default="{ row }">
          <template v-if="row.compileStatus === 'ok'">
            <span class="c-success">● 正常</span>
          </template>
          <template v-else>
            <span class="c-danger">● 编译失败：{{ row.compileError || '未知错误' }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="150">
        <template #default="{ row }">
          <span class="mono">{{ row.updatedAt }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" type="primary" @click="openCode(row)">编辑代码</el-button>
          <el-button
            link
            size="small"
            type="danger"
            :loading="isLoading(`rollback:${row.id}`)"
            @click="onRollback(row)"
          >
            回退上一版
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="PAGE_SIZE_OPTIONS"
        :layout="PAGINATION_LAYOUT"
        small
      />
    </div>

    <BlockCreateDialog
      v-model="createDialog"
      :site-id="PUBLIC_BLOCK_SITE_ID"
      default-scope="public"
      lock-scope
      @saved="load"
    />
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

.tip {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
