<script setup lang="ts">
/**
 * 块代码编辑器：Vue SFC 源码是块的唯一事实来源
 *
 * 左：源码编辑区（等宽字体 + 行号 gutter，错误行标红）；右：从源码抽取出的字段声明（只读，驱动后台动态表单）
 * 保存走 `PUT /blocks/:key`：编译失败返回 400 + `{ line, column, message }`，这里标红错误行并给出带行号的提示
 * 顶部常驻安全提示：块代码等价任意代码执行（ADR-024），仅可信人员可提交
 *
 * 归属（09 §4.5）：siteId = 0 时编辑的是**公共模板**（改模板不影响已引入的站点）；
 * siteId = 本站 id 时编辑的是**本站块**——站点尚未持有该块时，保存会自动复制一份本站副本再落笔。
 * 本页由列表页以**新标签页**打开（`window.open`），因此「返回」回到对应列表即可，不会丢失来源页现场。
 */
import { ElMessage } from 'element-plus'
import {
  PUBLIC_BLOCK_SITE_ID,
  blocksApi,
  type BlockCompileError,
  type BlockDetail,
  type BlockUsage
} from '~/config/api'
import { BLOCK_SCOPE_LABEL } from '~/config/menu'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const route = useRoute()
/** 块标识来自路径；siteId 来自 query（0 = 公共模板，其余为站点块，必须带上才能定位到记录） */
const blockKey = computed(() => String(route.params.key || ''))
const siteId = computed(() => String(route.query.siteId || '0'))
/** 是否在编辑公共模板（平台级） */
const isTemplate = computed(() => siteId.value === PUBLIC_BLOCK_SITE_ID)
/** 站点尚未持有该块（读到的是模板兜底）：保存会自动复制一份本站副本 */
const willCopyToSite = computed(() => !isTemplate.value && detail.value?.isSiteScoped === false)

const { loading: saving, run } = useLoading()

const detail = ref<BlockDetail | null>(null)
const usages = ref<BlockUsage[]>([])
const code = ref('')
const loading = ref(false)
const compileError = ref<BlockCompileError | null>(null)

/** 行号：按换行切分，与 textarea 逐行对齐 */
const lineCount = computed(() => code.value.split('\n').length)
/** 编译错误所在行（gutter 标红） */
const errorLine = computed(() => compileError.value?.line ?? 0)

async function load() {
  /** siteId = 0 是合法值（公共模板），不能按「假值」跳过 */
  if (!blockKey.value) return
  loading.value = true
  try {
    const [block, usageList] = await Promise.all([
      blocksApi.detail(blockKey.value, siteId.value),
      blocksApi.usages(blockKey.value, siteId.value)
    ])
    detail.value = block
    code.value = block.code
    usages.value = usageList
    compileError.value = null
  } finally {
    loading.value = false
  }
}

/** 保存（防抖在外、loading 在内）：编译失败时把错误行号留在编辑器上方 */
const onSave = debounce(
  () =>
    run(async () => {
      if (!blockKey.value) return
      compileError.value = null
      try {
        const updated = await blocksApi.save(blockKey.value, { siteId: siteId.value, code: code.value })
        ElMessage.success(`已保存：${updated.name}（v${updated.version}）`)
        await load()
      } catch (e: unknown) {
        /** 编译详情在响应体 data.compileError（http 层只统一提示 message） */
        const error = (e as { data?: { compileError?: BlockCompileError } })?.data?.compileError
        if (error) {
          compileError.value = error
          ElMessage.error(`编译失败：${error.message}（第 ${error.line} 行）`)
        }
      }
    }),
  DEBOUNCE_WAIT
)

/** gutter 与 textarea 滚动同步（行号是独立列，不跟随原生滚动） */
const gutterRef = ref<HTMLElement | null>(null)
function syncScroll(event: Event) {
  const target = event.target as HTMLElement
  if (gutterRef.value) gutterRef.value.scrollTop = target.scrollTop
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page-wrap">
    <div class="bar">
      <span class="panel-title">{{ detail?.name || blockKey }}</span>
      <span class="mono key">{{ blockKey }}</span>
      <el-tag size="small" :type="detail?.isSiteScoped ? 'warning' : 'info'" effect="plain">
        {{ BLOCK_SCOPE_LABEL[detail?.scope || 'site'] }}
      </el-tag>
      <span class="ver mono">v{{ detail?.version ?? '-' }}</span>
      <span class="spacer" />
      <el-button size="small" @click="navigateTo(isTemplate ? '/blocks/templates' : '/blocks')">返回</el-button>
      <el-button type="primary" size="small" :loading="saving" @click="onSave">保存</el-button>
    </div>

    <p v-if="isTemplate" class="safe-tip">
      当前是公共模板：只在站点首次引入时提供初始代码，改它不影响已引入的站点，只影响之后新引入的站点。
    </p>
    <p v-else-if="willCopyToSite" class="safe-tip">
      该块尚未引入本站：保存时会把公共模板复制一份作为本站块，之后的改动只影响本站。
    </p>
    <p class="safe-tip">安全提示：块代码等价任意代码执行，仅可信人员可提交；保存即编译校验，失败不会覆盖线上版本。</p>

    <p v-if="compileError" class="compile-error">
      编译失败：{{ compileError.message }}（第 {{ compileError.line }} 行，第 {{ compileError.column }} 列）
    </p>

    <div class="editor-row">
      <div class="code-panel">
        <div class="panel-head">
          <span class="panel-title">块源码</span>
          <span class="c-mute lines">共 {{ lineCount }} 行</span>
        </div>
        <div class="code-area">
          <div ref="gutterRef" class="gutter">
            <div v-for="line in lineCount" :key="line" class="gutter-line" :class="{ 'is-error': line === errorLine }">
              {{ line }}
            </div>
          </div>
          <textarea v-model="code" class="code mono" spellcheck="false" wrap="off" @scroll="syncScroll" />
        </div>
      </div>

      <div class="decl-panel">
        <div class="panel-head">
          <span class="panel-title"><TermHint term="blockFields" />（从源码抽取）</span>
          <span class="c-mute lines">{{ detail?.declaration?.fields?.length || 0 }} 个字段</span>
        </div>
        <el-table
          :data="detail?.declaration?.fields || []"
          border
          size="small"
          style="width: 100%"
          empty-text="该块未声明字段"
        >
          <el-table-column prop="key" label="字段键" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono">{{ row.key }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="label" label="标签" min-width="110" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="90">
            <template #default="{ row }">
              <span class="mono">{{ row.type }}</span>
            </template>
          </el-table-column>
          <el-table-column label="必填" width="60">
            <template #default="{ row }">
              <span :class="row.required ? 'c-danger' : 'c-mute'">{{ row.required ? '是' : '否' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="hint" label="说明" min-width="120" show-overflow-tooltip />
        </el-table>
        <p class="c-mute hint-inline">字段声明决定后台数据表单的渲染方式；改字段只需改源码，无需改后台代码。</p>
      </div>
    </div>

    <div class="usage-panel">
      <div class="panel-head">
        <span class="panel-title"><TermHint term="blockUsages" /></span>
        <span class="c-mute lines">{{ usages.length }} 个页面</span>
      </div>
      <el-table :data="usages" border size="small" style="width: 100%" empty-text="暂无页面引用该块">
        <el-table-column prop="title" label="页面" min-width="200" show-overflow-tooltip />
        <el-table-column label="路径" min-width="180">
          <template #default="{ row }">
            <span class="mono">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="row.status === 'published' ? 'c-success' : 'c-mute'">
              {{ row.status === 'published' ? '已发布' : row.status === 'pending_review' ? '待审核' : '草稿' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="count" label="实例数" width="90" />
        <el-table-column prop="enabled" label="启用中" width="90" />
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .key {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }

  .ver {
    font-size: $font-size-xs;
    color: $c-text-sub;
  }

  .spacer {
    flex: 1;
  }
}

.safe-tip {
  margin: 0;
  padding: $sp-1;
  border-radius: $radius-md;
  background: $c-elevated;
  color: $c-text-sub;
  font-size: $font-size-xs;
}

.compile-error {
  margin: 0;
  color: $c-danger;
  font-size: $font-size-sm;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .lines {
    font-size: $font-size-xs;
  }
}

.hint-inline {
  margin: 0;
  font-size: $font-size-xs;
}

.editor-row {
  display: flex;
  gap: $sp-1;
  min-height: 0;

  .code-panel,
  .decl-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $sp-1;
    background: $c-panel;
    border: 1px solid $c-border;
    border-radius: $radius-lg;
    padding: $sp-1;
  }
}

.code-area {
  display: flex;
  height: 420px;
  border: 1px solid $c-border-soft;
  border-radius: $radius-md;
  overflow: hidden;
}

.gutter {
  width: 48px;
  flex-shrink: 0;
  overflow: hidden;
  background: $c-elevated;
  border-right: 1px solid $c-border-soft;
  padding: $sp-1 0;
  text-align: right;

  .gutter-line {
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    line-height: 1.6;
    color: $c-text-faint;
    padding-right: $sp-1;
  }

  .is-error {
    color: $c-danger;
    font-weight: 500;
  }
}

.code {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  resize: none;
  padding: $sp-1;
  background: $c-input;
  color: $c-text;
  font-size: $font-size-xs;
  line-height: 1.6;
  overflow: auto;
}

.usage-panel {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  background: $c-panel;
  border: 1px solid $c-border;
  border-radius: $radius-lg;
  padding: $sp-1;
}
</style>
