<script setup lang="ts">
/**
 * 素材管理：static_files 表的可视化入口（服务端上传 / 列表 / 删除接口早已就绪，此前仅站点编辑页用了上传）
 * 按站点隔离：素材挂 siteId，切换站点即切换素材范围；仅支持常用图片格式上传；
 * 支持关键词搜索、多选上传、点击预览大图、复制访问地址、替换（引用地址不变）与删除
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  filesApi,
  sitesApi,
  resolveFileUrl,
  IMAGE_ACCEPT,
  IMAGE_MIMES,
  type SiteItem,
  type StaticFileItem
} from '~/config/api'
import { PAGINATION_LAYOUT, PAGE_SIZE_DEFAULT, PAGE_SIZE_OPTIONS } from '~/config/pagination'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

/** loading 状态（执行中互斥 + 按钮转圈）；防抖（时间窗口）由各动作外层的 `debounce` 负责 */
const { isLoading, run, runKeyed } = useLoading()

const sites = ref<Pick<SiteItem, 'id' | 'name'>[]>([])
const siteId = ref<string>()
const list = ref<StaticFileItem[]>([])
const total = ref(0)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(PAGE_SIZE_DEFAULT)

const fileInput = ref<HTMLInputElement>()
const copiedId = ref<string>()

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list.map((item) => ({ id: item.id, name: item.name }))
  if (!siteId.value && sites.value.length) siteId.value = sites.value[0].id
}

async function loadFiles() {
  if (!siteId.value) return
  await run(async () => {
    const result = await filesApi.list({
      siteId: siteId.value,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = result.list
    total.value = result.total
  })
}

/** 触发系统选文件（隐藏 input，避免为了上传单开弹窗组件） */
function pickFiles() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const images = files.filter((file) => IMAGE_MIMES.includes(file.type))
  if (files.length && !images.length) {
    ElMessage.warning('仅支持上传图片：jpg / png / webp / gif / svg / ico')
    return
  }
  if (images.length < files.length) {
    ElMessage.warning('已跳过非支持格式的文件')
  }
  if (!images.length || !siteId.value) return
  /** 整批备注（可空）：上传前一次性填写，标识这批素材的引用位置；取消即放弃本次上传 */
  let caption: string | undefined
  try {
    const { value } = await ElMessageBox.prompt(
      `将为 ${images.length} 个文件统一填写备注，用于标识素材引用在页面哪些位置`,
      '图片备注（可选）',
      { inputPlaceholder: '如：就诊环境页环境图' }
    )
    caption = value.trim() || undefined
  } catch {
    return
  }
  await run(async () => {
    for (const file of images) {
      await filesApi.upload(file, siteId.value, caption)
    }
    ElMessage.success(`已上传 ${images.length} 个文件`)
    page.value = 1
    await loadFiles()
  })
}

/** 编辑单条素材备注（prompt 取消视为放弃修改） */
async function editCaption(row: StaticFileItem) {
  try {
    const { value } = await ElMessageBox.prompt('标识当前素材引用在页面哪些位置，便于追溯管理', '图片备注', {
      inputValue: row.caption || '',
      inputPlaceholder: '如：诊疗设备页设备卡片'
    })
    await runKeyed(`caption:${row.id}`, async () => {
      await filesApi.updateCaption(row.id, value)
      ElMessage.success('备注已保存')
      await loadFiles()
    })
  } catch {
    /** 用户取消 */
  }
}

/** 复制访问地址（clipboard API 仅在安全上下文可用，失败时提示手动复制） */
async function copyUrl(row: StaticFileItem) {
  try {
    await navigator.clipboard.writeText(resolveFileUrl(row.publicUrl))
    copiedId.value = row.id
    ElMessage.success('访问地址已复制')
    setTimeout(() => (copiedId.value = undefined), 1500)
  } catch {
    ElMessage.warning('复制失败，请手动选中地址复制')
  }
}

/**
 * 替换素材：保留引用地址（publicUrl 不变），仅更新文件内容
 * 点击行按钮触发系统选文件（隐藏 input，accept 限定为原文件 MIME 类型，MIME 校验最终由服务端把关）
 */
const replaceTarget = ref<StaticFileItem | null>(null)
const replaceInput = ref<HTMLInputElement>()

const onReplace = debounce((row: StaticFileItem) => {
  replaceTarget.value = row
  const input = replaceInput.value
  if (!input) return
  if (row.mimeType) input.accept = row.mimeType
  input.click()
}, DEBOUNCE_WAIT)

async function onReplaceChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const target = replaceTarget.value
  input.value = ''
  if (!file || !target) return
  await runKeyed(`replace:${target.id}`, async () => {
    await filesApi.replace(target.id, file)
    ElMessage.success('素材已替换，引用地址不变')
    await loadFiles()
  })
}

const onRemove = debounce(
  (row: StaticFileItem) =>
    runKeyed(`remove:${row.id}`, async () => {
      try {
        await ElMessageBox.confirm(
          `确认删除素材「${row.originalName}」？已引用它的页面将无法再访问该文件。`,
          '删除确认',
          {
            type: 'warning'
          }
        )
      } catch {
        /** 用户取消 */
        return
      }
      await filesApi.remove(row.id)
      await loadFiles()
    }),
  DEBOUNCE_WAIT
)

/** 体积展示：小于 1MB 按 KB，其余按 MB（一位小数） */
function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

watch([page, pageSize], loadFiles)
watch(siteId, () => {
  page.value = 1
  loadFiles()
})
onMounted(async () => {
  await loadSites()
  await loadFiles()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">素材管理</span>
      <el-select v-model="siteId" size="small" placeholder="选择站点" style="width: 200px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        placeholder="搜索文件名"
        style="width: 180px"
        clearable
        @keyup.enter="loadFiles"
        @clear="loadFiles"
      />
      <span class="spacer" />
      <el-button type="primary" size="small" :loading="isLoading('upload')" @click="pickFiles">上传</el-button>
      <input ref="fileInput" type="file" multiple :accept="IMAGE_ACCEPT" class="upload-input" @change="onFileChange" />
      <input ref="replaceInput" type="file" class="upload-input" @change="onReplaceChange" />
    </div>

    <el-table v-loading="isLoading('load')" :data="list" border size="small" style="width: 100%" empty-text="暂无素材">
      <el-table-column label="ID" width="70">
        <template #default="{ row }">
          <span class="mono">#{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="预览" width="64" align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.mimeType?.startsWith('image/')"
            :src="resolveFileUrl(row.publicUrl)"
            :preview-src-list="[resolveFileUrl(row.publicUrl)]"
            preview-teleported
            hide-on-click-modal
            fit="cover"
            class="thumb"
            :alt="row.originalName"
          />
          <span v-else class="c-mute">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="originalName" label="文件名" min-width="180" show-overflow-tooltip />
      <el-table-column label="备注" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.caption">{{ row.caption }}</span>
          <span v-else class="c-mute">—</span>
        </template>
      </el-table-column>
      <el-table-column label="访问地址" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="mono">{{ row.publicUrl }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="mimeType" label="类型" width="140" show-overflow-tooltip />
      <el-table-column label="大小" width="90">
        <template #default="{ row }">
          <span class="mono">{{ formatSize(row.sizeBytes) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="上传时间" width="160">
        <template #default="{ row }">
          <span class="mono">{{ row.createdAt }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right" class-name="ops-col">
        <template #default="{ row }">
          <el-button link size="small" @click="copyUrl(row)">
            {{ copiedId === row.id ? '已复制' : '复制地址' }}
          </el-button>
          <el-button link size="small" :loading="isLoading(`caption:${row.id}`)" @click="editCaption(row)">
            备注
          </el-button>
          <el-button link size="small" :loading="isLoading(`replace:${row.id}`)" @click="onReplace(row)">
            替换
          </el-button>
          <el-button link size="small" type="danger" :loading="isLoading(`remove:${row.id}`)" @click="onRemove(row)">
            删除
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

.upload-input {
  display: none;
}

.thumb {
  display: block;
  width: 32px;
  height: 32px;
  margin: 0 auto;
  cursor: zoom-in;
  border-radius: $radius-sm;
  border: 1px solid $c-border-soft;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;
}
</style>
