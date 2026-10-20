<script setup lang="ts">
/**
 * GEO 监控工作台（总览仪表盘）：站点选择 + PV/UV 指标 + AI 抓取概览 + 发布任务
 * 数据全部走 app/config/api 下的统一接口层
 *
 * ⚠️ 目前未在任何页面挂载（根路径 2026-10-14 起改为空白占位页）：
 * 代码原样保留，需要恢复时在目标页面模板中写 <DashboardOverview /> 即可
 */
import { BUILD_STATUS_META, RENDER_MODE_LABEL } from '~/config/menu'
import { publishApi, sitesApi, trackApi } from '~/config/api'

const sites = ref<{ id: string; name: string; slug: string; renderMode: string }[]>([])
const currentSiteId = ref<string>()
const pv = ref(0)
const uv = ref(0)
const topPages = ref<{ path: string; pv: number }[]>([])
const aiTotal = ref(0)
const aiBots = ref<{ botType: string; count: number }[]>([])
const tasks = ref<{ id: string; type: string; status: string; createdAt: string }[]>([])

async function loadSites() {
  const result = await sitesApi.list({ pageSize: 100 })
  sites.value = result.list
  if (!currentSiteId.value && result.list.length) currentSiteId.value = result.list[0].id
}

async function loadStats() {
  if (!currentSiteId.value) return
  const [track, ai, taskList] = await Promise.all([
    trackApi.overview(currentSiteId.value, 7),
    trackApi.aiOverview(currentSiteId.value, 7),
    publishApi.tasks(currentSiteId.value)
  ])
  pv.value = track.pv
  uv.value = track.uv
  topPages.value = track.topPages.slice(0, 6)
  aiTotal.value = ai.total
  aiBots.value = ai.bots.slice(0, 5)
  tasks.value = taskList.slice(0, 6)
}

watch(currentSiteId, loadStats)

onMounted(async () => {
  await loadSites()
  await loadStats()
})

const modeLabel = computed(() => {
  const site = sites.value.find((item) => item.id === currentSiteId.value)
  return site ? RENDER_MODE_LABEL[site.renderMode] || site.renderMode : ''
})
</script>

<template>
  <div class="page-wrap">
    <div class="bar">
      <span class="panel-title">GEO 监控工作台</span>
      <el-select v-model="currentSiteId" size="small" placeholder="选择站点" style="width: 200px">
        <el-option v-for="site in sites" :key="site.id" :label="site.name" :value="site.id" />
      </el-select>
      <span class="mode"><TermHint term="renderMode" />：{{ modeLabel }}</span>
    </div>

    <div class="grid4">
      <div class="chip">
        <span class="lab">近 7 日 <TermHint term="pv" /></span>
        <span class="fig mono">{{ pv.toLocaleString() }}</span>
      </div>
      <div class="chip">
        <span class="lab">近 7 日 <TermHint term="uv" /></span>
        <span class="fig mono">{{ uv.toLocaleString() }}</span>
      </div>
      <div class="chip">
        <span class="lab"><TermHint term="aiCrawler" />抓取次数</span>
        <span class="fig mono accent">{{ aiTotal.toLocaleString() }}</span>
      </div>
      <div class="chip">
        <span class="lab">站点数</span>
        <span class="fig mono">{{ sites.length }}</span>
      </div>
    </div>

    <div class="row">
      <div class="panel flex1">
        <div class="hd">
          <span class="panel-title">最近<TermHint term="publishTask" /></span>
        </div>
        <el-table :data="tasks" border size="small" style="width: 100%" empty-text="暂无发布任务">
          <el-table-column label="任务" width="80">
            <template #default="{ row }">
              <span class="mono">#{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ row.scope === 'site' ? '整站重建' : '页面发布' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <span :class="BUILD_STATUS_META[row.status]?.className">
                {{ BUILD_STATUS_META[row.status]?.label }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="时间" min-width="160">
            <template #default="{ row }">
              <span class="mono">{{ row.createdAt }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="list-panel w320">
        <div class="hd">
          <span class="panel-title"><TermHint term="aiCrawler" /> Top</span>
        </div>
        <ul class="bot-list">
          <li v-for="bot in aiBots" :key="bot.botType" class="bot">
            <p class="line">
              <span>{{ bot.botType }}</span>
              <span class="mono">{{ bot.count }}</span>
            </p>
            <div class="pbar">
              <span :style="{ width: `${Math.round((bot.count / Math.max(aiTotal, 1)) * 100)}%` }" />
            </div>
          </li>
          <li v-if="!aiBots.length" class="empty">暂无 AI 抓取数据</li>
        </ul>
      </div>
    </div>

    <div class="panel">
      <div class="hd">
        <span class="panel-title"><TermHint term="hotRoute" /></span>
      </div>
      <el-table :data="topPages" border size="small" style="width: 100%" empty-text="暂无埋点数据">
        <el-table-column prop="path" label="路由" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column width="120">
          <template #header><TermHint term="pv" /></template>
          <template #default="{ row }">
            <span class="mono">{{ row.pv }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  display: flex;
  align-items: center;
  gap: $sp-1;

  .mode {
    font-size: $font-size-xs;
    color: $c-text-mute;
  }
}

.grid4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
    color: $c-text;
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

.w320 {
  width: 320px;
  flex-shrink: 0;
}

.panel {
  @include panel;
}

/** 内部为 border 模式表格的面板：外框由表格承担 */
.list-panel {
  @include panel;
}

.panel {
  @include panel;
  border: 0;
  overflow: hidden;
}

.hd {
  padding: 6px 10px;
}

.bot-list {
  margin: 0;
  padding: $sp-2;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: $sp-1;

  .empty {
    color: $c-text-faint;
    text-align: center;
    padding: $sp-3 0;
  }
}

.bot .line {
  margin: 0;
  display: flex;
  justify-content: space-between;
  font-size: $font-size-xs;
  color: $c-text-sub;
}

.pbar {
  height: 4px;
  background: $c-border-soft;
  border-radius: 2px;
  margin-top: 4px;

  span {
    display: block;
    height: 4px;
    background: $c-primary;
    border-radius: 2px;
  }
}
</style>
