<script setup lang="ts">
/**
 * GEO 产物弹窗：查看 / 手动替换站点级 GEO 产物文件（robots.txt / sitemap.xml / llms.txt）
 * 数据源为 `GET /publish/geo-docs/:siteId` —— 读取**已构建产物目录里落盘的文件本身**，
 * 看到的就是产物包 / 线上托管的内容，不是实时计算结果。
 *
 * 更新口径（09 §8.4）：文件平时由发布 / 构建按统一口径自动生成——
 *   - 站点配置（域名 / NAP / 爬虫策略 / llms 自定义）变更 → 「GEO 索引更新」只重出这三个文件；
 *   - 页面内容变更 → 页面发布 / 整站重建，索引随构建重新生成。
 * 「编辑」是**非常规兜底**（自动结果无法满足特殊上线要求时人工直写，一般用不到）：
 * 保存即写入产物文件，下次索引更新 / 重建会被自动内容覆盖。
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { publishApi, type GeoDocsSummary } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId: string
  siteName: string
}>()

const { isLoading, run, runKeyed } = useLoading()

const summary = ref<GeoDocsSummary | null>(null)
const loading = ref(false)

/** 当前激活的文件页签 */
const activeTab = ref('robots')

/** 编辑态（非常规兜底）：仅对当前页签生效，切页签自动退出 */
const editing = ref(false)
const draft = ref('')

/** 当前页签对应的文件条目 */
const currentDoc = computed(() => summary.value?.documents.find((doc) => doc.key === activeTab.value))

/** 字节数展示：小于 1KB 显示字节数，否则显示 KB（等宽字体由外层 mono 负责） */
function sizeText(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`
}

/** immediate：组件随 `v-if` 首次创建时 visible 已为 true，不加会漏掉首次加载 */
watch(
  visible,
  async (open) => {
    if (!open || !props.siteId) return
    activeTab.value = 'robots'
    editing.value = false
    draft.value = ''
    summary.value = null
    loading.value = true
    try {
      summary.value = await publishApi.geoDocs(props.siteId)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

/** 重新加载（GEO 索引更新 / 手动替换完成后刷新文件内容与时间） */
async function reload() {
  loading.value = true
  try {
    summary.value = await publishApi.geoDocs(props.siteId)
  } finally {
    loading.value = false
  }
}

/** 切页签即退出编辑：草稿不跨文件携带，避免把 A 文件的内容误存进 B 文件 */
watch(activeTab, () => {
  editing.value = false
  draft.value = ''
})

/** 进入编辑（仅当前页签文件存在且未在编辑时） */
function startEdit() {
  if (!currentDoc.value?.exists || editing.value) return
  draft.value = currentDoc.value.content
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  draft.value = ''
}

/** 保存手动替换：无改动直接提示；有改动则二次确认「直接写产物 + 会被自动内容覆盖」后 PUT 落盘 */
const onSave = debounce(
  () =>
    runKeyed('saveGeoDoc', async () => {
      const doc = currentDoc.value
      if (!doc) return
      if (draft.value === doc.content) {
        ElMessage.info('内容未改动，无需保存')
        editing.value = false
        return
      }
      try {
        await ElMessageBox.confirm(
          `手动替换的内容会直接写入线上产物文件 ${doc.file}；下次「GEO 索引更新」或整站重建时会按自动口径重新生成并覆盖。确认替换？`,
          '手动替换确认',
          { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await publishApi.saveGeoDoc(props.siteId, doc.key, draft.value)
      ElMessage.success(`已替换 ${doc.file}`)
      editing.value = false
      draft.value = ''
      await reload()
    }),
  DEBOUNCE_WAIT
)

/**
 * GEO 索引更新：只重出 robots / sitemap / llms 与清单路由，不重渲染页面（几秒完成）。
 * 适用：站点配置改了但页面内容没动；页面内容变更请走页面发布 / 整站重建。
 */
const onRepair = debounce(
  () =>
    runKeyed('repair', async () => {
      try {
        await ElMessageBox.confirm(
          '只重出 robots.txt / sitemap.xml / llms.txt 与产物清单路由，页面不重渲染，几秒完成。确认执行？',
          'GEO 索引更新',
          { type: 'info', confirmButtonText: '执行', cancelButtonText: '取消' }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await publishApi.repair(props.siteId)
      ElMessage.success('GEO 索引已更新')
      await reload()
    }),
  DEBOUNCE_WAIT
)

const onRefresh = debounce(() => run(reload), DEBOUNCE_WAIT)
</script>

<template>
  <el-dialog v-model="visible" :title="`GEO 产物 · ${siteName}`" width="720px" top="3vh">
    <div v-loading="loading" class="geo-docs-body">
      <el-alert
        v-if="summary && !summary.hasArtifacts"
        type="warning"
        :closable="false"
        show-icon
        title="尚未构建产物，请先发布站点"
        description="发布成功后 robots.txt / sitemap.xml / llms.txt 会随构建生成，届时可再次打开本弹窗查看。"
      />
      <template v-else-if="summary">
        <div class="meta">
          <span
            >产物站点前缀：<span class="mono">{{ summary.slug }}</span></span
          >
          <span
            >最近构建：<span class="mono">{{ summary.generatedAt || '暂无' }}</span></span
          >
          <el-button link size="small" :disabled="editing" :loading="isLoading()" @click="onRefresh">刷新</el-button>
        </div>

        <el-alert type="info" :closable="false" show-icon class="update-note">
          <template #title>
            文件由发布 / 构建自动生成：<TermHint
              term="geoIndexUpdate"
            />用于站点配置变更后重出索引；页面内容变更走页面发布 / 整站重建。<TermHint term="jsonLd" /> 按页面内嵌在各
            HTML 中（非独立文件），可在内容编辑器的 GEO 预览逐页查看。
          </template>
        </el-alert>

        <el-tabs v-model="activeTab" class="doc-tabs">
          <el-tab-pane v-for="doc in summary.documents" :key="doc.key" :name="doc.key">
            <template #label>
              <span class="tab-label">
                {{ doc.file }}
                <el-tag v-if="!doc.exists" size="small" type="danger" effect="plain">缺失</el-tag>
              </span>
            </template>
            <div class="doc-meta">
              <span v-if="editing" class="doc-desc c-warning">手动替换模式：保存后直接写入产物文件</span>
              <span v-else class="doc-desc">{{ doc.description }}</span>
              <span class="doc-actions">
                <span v-if="doc.exists && !editing" class="mono doc-size"
                  >{{ sizeText(doc.size) }} · 更新于 {{ doc.updatedAt }}</span
                >
                <el-button v-if="doc.exists && !editing" link size="small" @click="startEdit">编辑</el-button>
              </span>
            </div>
            <pre v-if="doc.exists && !editing" class="doc-content"><code>{{ doc.content }}</code></pre>
            <el-input
              v-else-if="doc.exists && editing"
              v-model="draft"
              type="textarea"
              :rows="18"
              class="doc-editor"
              spellcheck="false"
            />
            <el-alert
              v-else
              type="warning"
              :closable="false"
              show-icon
              title="产物中不存在该文件"
              description="执行一次发布或 GEO 索引更新后生成。"
            />
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>

    <template #footer>
      <el-button @click="editing ? cancelEdit() : (visible = false)">
        {{ editing ? '放弃编辑' : '取消' }}
      </el-button>
      <el-button v-if="editing" type="primary" :loading="isLoading('saveGeoDoc')" @click="onSave">保存</el-button>
      <el-button
        v-else
        type="success"
        :disabled="!!summary && !summary.hasArtifacts"
        :loading="isLoading('repair')"
        @click="onRepair"
      >
        GEO 索引更新
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.geo-docs-body {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  min-height: 120px;
}

.meta {
  display: flex;
  align-items: center;
  gap: $sp-2;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.update-note {
  font-size: $font-size-xs;

  :deep(.el-alert__title) {
    font-weight: 400;
    line-height: 1.6;
  }
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: Consolas, Monaco, monospace;
}

.doc-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $sp-1;
  margin-bottom: 6px;
}

.doc-desc {
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.doc-actions {
  display: inline-flex;
  align-items: baseline;
  gap: $sp-1;
}

.doc-size {
  flex: none;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.doc-content {
  /** 视口自适应：矮屏下（配合 dialog top=3vh）整弹窗仍收在一屏内 */
  max-height: min(420px, 48vh);
  margin: 0;
  padding: $sp-1;
  overflow: auto;
  background: $c-text;
  border-radius: $radius-md;
  font-size: $font-size-xs;
  line-height: 1.6;

  code {
    color: #e5ecf7;
    font-family: Consolas, Monaco, monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

/** 手动替换编辑器：等宽字体与产物正文一致，高度与只读态同档视口自适应 */
.doc-editor {
  :deep(.el-textarea__inner) {
    max-height: min(420px, 48vh);
    padding: $sp-1;
    font-family: Consolas, Monaco, monospace;
    font-size: $font-size-xs;
    line-height: 1.6;
  }
}
</style>
