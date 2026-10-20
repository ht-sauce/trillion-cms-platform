<script setup lang="ts">
/**
 * GEO 监控看板：AI 爬虫抓取趋势 + 抓取路径 Top
 * v1 数据源为服务端采集（nginx 日志 / llms.txt 动态返回记录）
 */
import { sitesApi, trackApi } from '~/config/api'

const sites = ref<{ id: string; name: string }[]>([])
const siteId = ref<string>()
const days = ref(7)
const ai = ref<{
  total: number
  bots: { botType: string; count: number }[]
  paths: { path: string; count: number }[]
}>()

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list
  if (!siteId.value && result.list.length) siteId.value = result.list[0].id
}

async function load() {
  if (!siteId.value) return
  ai.value = await trackApi.aiOverview(siteId.value, days.value)
}

watch([siteId, days], load)
onMounted(async () => {
  await loadSites()
  await load()
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">GEO 监控</span>
      <el-select v-model="siteId" size="small" style="width: 200px">
        <el-option v-for="s in sites" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="days" size="small" style="width: 100px">
        <el-option :label="'近 7 日'" :value="7" />
        <el-option :label="'近 30 日'" :value="30" />
      </el-select>
    </div>

    <div class="grid3">
      <div class="chip">
        <span class="lab">AI 抓取总次数</span>
        <span class="fig mono accent">{{ (ai?.total || 0).toLocaleString() }}</span>
      </div>
      <div class="chip">
        <span class="lab">爬虫种类</span>
        <span class="fig mono">{{ ai?.bots.length || 0 }}</span>
      </div>
      <div class="chip">
        <span class="lab">被抓取页面</span>
        <span class="fig mono">{{ ai?.paths.length || 0 }}</span>
      </div>
    </div>

    <div class="row">
      <div class="panel flex1">
        <div class="hd">
          <span class="panel-title"><TermHint term="aiCrawler" />分布</span>
        </div>
        <el-table
          :data="ai?.bots || []"
          border
          size="small"
          style="width: 100%"
          empty-text="暂无 AI 抓取数据（自托管模式需配置 nginx 日志采集）"
        >
          <el-table-column prop="botType" label="爬虫" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono">{{ row.botType }}</span>
            </template>
          </el-table-column>
          <el-table-column label="抓取次数" width="100">
            <template #default="{ row }">
              <span class="mono">{{ row.count }}</span>
            </template>
          </el-table-column>
          <el-table-column label="占比" width="160">
            <template #default="{ row }">
              <span class="pbar">
                <span :style="{ width: `${Math.round((row.count / Math.max(ai?.total || 1, 1)) * 100)}%` }" />
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel flex1">
        <div class="hd"><span class="panel-title">被抓取页面 Top</span></div>
        <el-table :data="ai?.paths || []" border size="small" style="width: 100%" empty-text="暂无数据">
          <el-table-column prop="path" label="路径" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono">{{ row.path }}</span>
            </template>
          </el-table-column>
          <el-table-column label="次数" width="100">
            <template #default="{ row }">
              <span class="mono">{{ row.count }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="notes-panel">
      <div class="hd"><span class="panel-title">说明</span></div>
      <ul class="notes">
        <li>自托管模式：nginx access log 由采集器过滤 AI UA 后推送至服务端 /geoserver/track/ai-crawl 入表</li>
        <li>CDN 模式：v1 不覆盖回源日志，架构已预留日志源适配器，后期接入即可</li>
        <li>robots.txt 默认放行全部已知 AI 爬虫——这是 GEO 能否生效的前提</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;
}

.grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $sp-1;
}

.chip {
  @include panel;
  padding: $sp-2;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .lab {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }

  .fig {
    font-size: $font-size-figure;
    font-weight: 500;
  }

  .accent {
    color: $c-accent;
  }
}

.row {
  display: flex;
  gap: $sp-2;
}

.flex1 {
  flex: 1;
  min-width: 0;
}

.panel {
  @include panel;
  // 面板内是 border 模式表格：外框由表格承担，避免双层边框
  border: 0;
  overflow: hidden;
}

/** 纯文字说明面板：内部没有表格承担外框，保留完整面板边框 */
.notes-panel {
  @include panel;
}

.hd {
  padding: 6px 10px;
}

.pbar {
  display: block;
  height: 4px;
  background: $c-border-soft;
  border-radius: 2px;

  span {
    display: block;
    height: 4px;
    background: $c-primary;
    border-radius: 2px;
  }
}

.notes {
  margin: 0;
  padding: $sp-2 $sp-3;
  color: $c-text-mute;
  font-size: $font-size-xs;
  line-height: 2;
}
</style>
