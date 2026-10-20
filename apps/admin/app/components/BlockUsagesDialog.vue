<script setup lang="ts">
/**
 * 块使用位置弹窗：列出引用了该块的页面（含实例数与启用数）
 * 块库列表行与块代码编辑器共用；打开时按 key + siteId 现查，不做缓存（块引用随时会变）
 */
import { blocksApi, type BlockUsage } from '~/config/api'
import { TERMS } from '~/config/glossary'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  /** 块标识 */
  blockKey: string
  siteId: string
  /** 弹窗标题后缀（块展示名） */
  blockName?: string
}>()

const list = ref<BlockUsage[]>([])
const loading = ref(false)

watch(visible, async (open) => {
  if (!open || !props.siteId || !props.blockKey) return
  loading.value = true
  try {
    list.value = await blocksApi.usages(props.blockKey, props.siteId)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-dialog v-model="visible" :title="`${TERMS.blockUsages.label} · ${blockName || blockKey}`" width="720px">
    <el-table :data="list" border size="small" style="width: 100%" empty-text="暂无页面引用该块">
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
      <el-table-column prop="count" label="实例数" width="80" />
      <el-table-column prop="enabled" label="启用中" width="80" />
    </el-table>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
