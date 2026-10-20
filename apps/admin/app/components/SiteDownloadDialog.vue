<script setup lang="ts">
/**
 * 站点下载弹窗（09 §8.5）：选择分包模式（完整包 / 纯静态包）并下载产物 zip
 * 打开时拉取产物状态：未构建 → 禁用下载并提示先发布；存在未发布改动 → 下载前二次确认
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { publishApi, type ArtifactSummary } from '~/config/api'
import { DEBOUNCE_WAIT, debounce, useLoading } from '~/utils/tool'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  siteId: string
  siteName: string
}>()

const { isLoading, run } = useLoading()

/** 分包模式：full=可直接托管 / html=仅 HTML 与 GEO 产物（CDN 回源） */
const mode = ref<'full' | 'html'>('full')
const summary = ref<ArtifactSummary | null>(null)
const checking = ref(false)

/** 未发布改动页数（下载的是上次构建产物，需二次确认） */
const pendingCount = computed(() => (summary.value?.pages ?? []).filter((page) => page.status !== 'published').length)

/** 部署说明展开态：下载成功后自动展开，避免拿到包不知道怎么上线 */
const deployOpen = ref(false)

/**
 * nginx 参考配置：产物是目录式 SSG（/news → news/index.html），每个路由都有真实文件，
 * 标准静态托管即可访问，**不需要** rewrite 路由转发；只需保证目录能回落 index.html
 */
const nginxConf = [
  'server {',
  '    listen 80;',
  '    server_name example.com;        # 换成你的域名',
  '    root /var/www/site;             # 解压后的根目录（index.html 在这一层）',
  '',
  '    location / {',
  '        try_files $uri $uri/ =404;  # 目录会自动 301 带斜杠并回落其 index.html',
  '    }',
  '}'
].join('\n')

/** 复制 nginx 配置到剪贴板（clipboard API 仅在安全上下文可用，失败时提示手动复制） */
async function onCopyConf() {
  try {
    await navigator.clipboard.writeText(nginxConf)
    ElMessage.success('nginx 配置已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中代码复制')
  }
}

/** immediate：组件随 `v-if` 首次创建时 visible 已为 true，不加会漏掉首次状态加载 */
watch(
  visible,
  async (open) => {
    if (!open || !props.siteId) return
    mode.value = 'full'
    deployOpen.value = false
    summary.value = null
    checking.value = true
    try {
      summary.value = await publishApi.artifacts(props.siteId)
    } finally {
      checking.value = false
    }
  },
  { immediate: true }
)

const onDownload = debounce(
  () =>
    run(async () => {
      if (!summary.value?.hasArtifacts) {
        ElMessage.warning('尚未构建产物，请先发布站点')
        return
      }
      if (pendingCount.value > 0) {
        try {
          await ElMessageBox.confirm(
            `该站点有 ${pendingCount.value} 个页面存在未发布改动，下载的是上次构建产物，确认下载？`,
            '下载确认',
            { type: 'warning' }
          )
        } catch {
          /** 用户取消 */
          return
        }
      }
      await publishApi.download(props.siteId, mode.value)
      /** 下载成功即展开部署说明：用户此刻正要知道"解压后怎么上线" */
      deployOpen.value = true
    }),
  DEBOUNCE_WAIT
)
</script>

<template>
  <el-dialog v-model="visible" :title="`下载站点 · ${siteName}`" width="560px">
    <div v-loading="checking" class="download-body">
      <el-alert
        v-if="summary && !summary.hasArtifacts"
        type="warning"
        :closable="false"
        show-icon
        title="尚未构建产物，请先发布站点"
        description="发布成功后，产物包才会生成，届时可再次打开本弹窗下载。"
      />
      <template v-else-if="summary">
        <div class="meta">
          <span
            >最近构建：<span class="mono">{{ summary.lastBuiltAt || '暂无' }}</span></span
          >
          <span
            ><TermHint term="artifactManifest" />（路由数）：<span class="mono">{{ summary.routeCount }}</span></span
          >
        </div>
        <el-alert
          v-if="pendingCount > 0"
          type="warning"
          :closable="false"
          show-icon
          :title="`存在 ${pendingCount} 个页面未发布，下载的是上次构建产物`"
        />
      </template>

      <div class="block">
        <p class="label"><TermHint term="downloadMode" /></p>
        <el-radio-group v-model="mode" class="mode-group">
          <el-radio value="full">
            <span class="mode-name">完整包（推荐）</span>
            <span class="mode-desc">解压后整个目录丢到任意静态托管即可上线，页面交互完整。不确定选哪个就选它</span>
          </el-radio>
          <el-radio value="html">
            <span class="mode-name">纯静态包</span>
            <span class="mode-desc"
              >只含 HTML 页面，体积小；仅供已有线上站点的 CDN 回源同步——单独部署会缺 JS/CSS，页面交互失效</span
            >
          </el-radio>
        </el-radio-group>
      </div>

      <div class="block">
        <button class="deploy-toggle" type="button" @click="deployOpen = !deployOpen">
          <span class="label">部署说明</span>
          <span class="deploy-summary">解压到站点根目录 · 必须用 http 访问 · 含 nginx 配置</span>
          <span class="deploy-arrow">{{ deployOpen ? '收起 ▴' : '展开 ▾' }}</span>
        </button>
        <div v-show="deployOpen" class="deploy-body">
          <ol class="deploy-steps">
            <li>
              解压后把包内<b>全部文件</b>放到站点根目录（<code>index.html</code> 在这一层）；完整包已含
              <code>_nuxt</code> 资源，无需额外处理。
            </li>
            <li>
              必须通过 <code>http://</code> 访问：<b>双击打开（file://）会导致页面导航与交互全部失效</b>
              ——这是浏览器对根路径的限制，不是包的问题。
            </li>
            <li>
              按根路径部署：链接形如 <code>/news → news/index.html</code>，<b>不要</b>放到子路径（如
              <code>/subdir/</code>）下，否则会 404。
            </li>
            <li>
              产物是目录式 SSG，每个路由都有真实文件，<b>无需配置 rewrite 路由转发</b>——只要目录能回落
              <code>index.html</code>（下方配置已含）。
            </li>
          </ol>
          <div class="conf-head">
            <span class="label">nginx 参考配置</span>
            <el-button link type="primary" size="small" @click="onCopyConf">复制</el-button>
          </div>
          <pre class="conf"><code>{{ nginxConf }}</code></pre>
          <p class="deploy-note">包内 <code>DEPLOY.md</code> 有一份同样的说明，可随包转交给部署人员。</p>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!!summary && !summary.hasArtifacts"
        :loading="isLoading('download')"
        @click="onDownload"
      >
        下载
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.download-body {
  display: flex;
  flex-direction: column;
  gap: $sp-1;
  min-height: 80px;
}

.meta {
  display: flex;
  gap: $sp-2;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.mode-group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: $sp-1;
}

/** 单选项：圆点与首行标题顶部对齐，多行说明文字左对齐换行（EP 默认 nowrap 会挤成一行） */
.mode-group :deep(.el-radio) {
  align-items: flex-start;
  height: auto;
  margin-right: 0;
  white-space: normal;
}

.mode-group :deep(.el-radio .el-radio__input) {
  margin-top: 3px;
}

.mode-group :deep(.el-radio .el-radio__label) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  white-space: normal;
  line-height: 1.5;
}

.mode-name {
  font-weight: 600;
}

.mode-desc {
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $c-text-mute;
  line-height: 1.5;
}

/** 部署说明折叠头：整行可点，左侧标题与 .label 对齐，右侧展开提示 */
.deploy-toggle {
  display: flex;
  align-items: center;
  gap: $sp-1;
  width: 100%;
  padding: 6px 0 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
}

.deploy-toggle .label {
  flex: none;
}

.deploy-summary {
  flex: 1;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.deploy-arrow {
  flex: none;
  font-size: $font-size-xs;
  color: $c-primary;
}

.deploy-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: $sp-1;
  background: $c-bg;
  border: 1px solid $c-border-soft;
  border-radius: $radius-md;
}

.deploy-steps {
  margin: 0;
  padding-left: 18px;
  font-size: $font-size-xs;
  color: $c-text-sub;
  line-height: 1.7;

  li + li {
    margin-top: 2px;
  }

  b {
    color: $c-text;
  }

  code {
    padding: 0 3px;
    background: $c-elevated;
    border-radius: $radius-sm;
    font-family: Consolas, Monaco, monospace;
    color: $c-text;
  }
}

.conf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conf {
  margin: 0;
  padding: $sp-1;
  overflow-x: auto;
  background: $c-text;
  border-radius: $radius-sm;
  font-size: $font-size-xs;
  line-height: 1.6;

  code {
    color: #e5ecf7;
    font-family: Consolas, Monaco, monospace;
  }
}

.deploy-note {
  margin: 0;
  font-size: $font-size-xs;
  color: $c-text-mute;

  code {
    padding: 0 3px;
    background: $c-elevated;
    border-radius: $radius-sm;
    font-family: Consolas, Monaco, monospace;
    color: $c-text;
  }
}
</style>
