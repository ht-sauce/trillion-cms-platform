<script setup lang="ts">
/**
 * 系统设置 · 运行配置（平台级）：仅平台级角色可见
 * 展示当前账号与角色、接口基址、上传目录、AI 爬虫策略等全局配置
 * 表格：统一 border 模式（列宽可拖拽）
 */
import { TERMS, type TermKey } from '~/config/glossary'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
/** 接口基址取自运行时配置（根 env/ 经 config/ 派生后注入），不在前端硬编码 */
const apiBase = useRuntimeConfig().public.apiBase

interface ConfigRow {
  key: string
  value: string
  mono: boolean
  /** 有对应术语的配置项：名词与解释统一取自 config/glossary.ts */
  term?: TermKey
}

/** 运行配置项（数据驱动，便于统一表格渲染） */
const rows = computed<ConfigRow[]>(() => [
  {
    key: '当前账号',
    value: `${auth.user?.username || '-'}（${auth.user?.roleName || '-'}${
      auth.user?.platform ? ` · ${TERMS.platformRole.label}` : ''
    }）`,
    mono: false
  },
  { key: TERMS.apiBase.label, value: apiBase, mono: true, term: 'apiBase' },
  { key: TERMS.timezone.label, value: 'Asia/Shanghai，时间格式 YYYY-MM-DD HH:mm:ss', mono: false, term: 'timezone' },
  {
    key: TERMS.staticStorage.label,
    value: '服务端 uploads/ 目录，URL 前缀 /static',
    mono: false,
    term: 'staticStorage'
  },
  {
    key: TERMS.robotsPolicy.label,
    value: '默认放行全部已知 AI 爬虫（站点级可覆盖）',
    mono: false,
    term: 'robotsPolicy'
  }
])
</script>

<template>
  <div class="page-wrap">
    <div class="panel">
      <div class="hd"><span class="panel-title">运行配置</span></div>
      <el-table :data="rows" border size="small" style="width: 100%">
        <el-table-column width="220">
          <template #header>配置项</template>
          <template #default="{ row }">
            <TermHint v-if="row.term" :term="row.term" />
            <span v-else>{{ row.key }}</span>
          </template>
        </el-table-column>
        <el-table-column label="值">
          <template #default="{ row }">
            <span :class="{ mono: row.mono }">{{ row.value }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel {
  @include panel;
  // 面板内是 border 模式表格：外框由表格承担，避免双层边框
  border: 0;
  overflow: hidden;
}

.hd {
  padding: 6px 10px;
}
</style>
