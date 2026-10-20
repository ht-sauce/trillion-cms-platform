<script setup lang="ts">
/**
 * 页面渲染组件：加载页面数据 → 注入 GEO 元数据 → 渲染结构化 Block
 *
 * 分层归属（09 §10.1）：
 *   块    = 结构（语义化 HTML）
 *   页面  = JSON-LD / canonical / title / description / keywords
 *   站点  = 实体声明 / llms.txt / robots
 *
 * 关键设计：JSON-LD 与 canonical **由服务端算好**随页面数据返回，这里只负责注入。
 * 目的是让「后台预览看到的」与「线上产物里的」完全一致——
 * 若前端再拼一次，两份实现迟早漂移（09 §10.3 的硬要求）。
 *
 * 页面模板：本引擎**不为 24 个页面各写一个 .vue**，
 * 一个 `[...slug].vue` 按路径取数据、由 Block 数组驱动渲染——
 * 这正是块架构的意义：改版改的是块，不是 24 份模板。
 */
import type { BlockInstance } from '@trillion/shared'
import { usePage } from '../composables/usePage'
import { useSite } from '../composables/useSite'
import { buildBlockContext } from '../utils/block-context'

const props = defineProps<{ path: string }>()

const { site, load: loadSite } = useSite()
const { page, load: loadPage } = usePage(props.path)

await loadSite()
await loadPage()

/** 块渲染上下文（站点 / 页面 / 目录 / 实体 / 时间，见 09 §5） */
const context = computed(() =>
  site.value && page.value ? buildBlockContext({ site: site.value, page: page.value }) : null
)

/**
 * H1 全页唯一：由 hero-dark 等首屏块提供（设计稿硬要求）。
 * 若页面没有首屏块（纯列表 / 法务页），这里兜底渲染一次，避免出现无 H1 的页面。
 */
function hasHeroBlock(blocks: BlockInstance[] | undefined): boolean {
  return (blocks || []).some((block) => block.key === 'hero-dark' && block.enabled !== false)
}

/** 从服务端生成的 meta 标签串里取出 content（服务端给的是完整标签，useSeoMeta 需要值） */
function robotsContent(): string {
  const tag = site.value?.robotsMetaTags || ''
  const match = /content="([^"]*)"/.exec(tag)
  return match ? match[1] : 'index,follow'
}

/** 实体档案页额外注入机构实体声明：全站只在这一页输出完整实体，其他页用 @id 引用 */
const isEntityPage = computed(() => Boolean(page.value && page.value.path === (site.value?.entityPath || '/entity')))

const jsonLdScripts = computed(() => {
  const list: { type: string; innerHTML: string }[] = []
  if (page.value?.jsonLd) list.push({ type: 'application/ld+json', innerHTML: page.value.jsonLd })
  if (isEntityPage.value && site.value?.entityJsonLd) {
    list.push({ type: 'application/ld+json', innerHTML: site.value.entityJsonLd })
  }
  return list
})

if (page.value) {
  useSeoMeta({
    title: () => page.value?.seoTitle || page.value?.title || site.value?.name || '',
    description: () => page.value?.seoDescription || page.value?.summary || site.value?.seoDescription || '',
    keywords: () => page.value?.seoKeywords || site.value?.seoKeywords || ''
  })
}

/**
 * canonical / JSON-LD / robots meta 统一注入 head
 * （Vue 模板内不允许出现 <script> 标签，结构化数据必须走 useHead）
 */
useHead({
  link: page.value?.canonical ? [{ rel: 'canonical', href: page.value.canonical }] : [],
  meta: [{ name: 'robots', content: robotsContent() }],
  script: jsonLdScripts.value
})
</script>

<template>
  <article class="page">
    <FrameBreadcrumb
      v-if="page"
      :page-title="page.title"
      :page-path="page.path"
      :ancestors="page.channel?.ancestors || []"
      :channel-name="page.channel?.name || null"
      :channel-path="page.channel?.path || null"
    />

    <template v-if="page">
      <header v-if="!hasHeroBlock(page.blocks)" class="page-head">
        <h1 class="page-title">{{ page.title }}</h1>
        <p v-if="page.summary" class="page-summary">{{ page.summary }}</p>
      </header>

      <BlockRenderer v-if="context" :blocks="page.blocks || []" :context="context" />
    </template>

    <p v-else class="empty">页面不存在或未发布</p>
  </article>
</template>

<style scoped lang="scss">
.page {
  display: block;
  background: var(--bg);
}

.page-head {
  max-width: var(--wrap);
  margin: 0 auto;
  padding: 24px 16px 0;
  /* theme-b.css 的裸元素选择器 header{...} 是站点顶栏样式，
     会误伤本兜底页头（无 hero 块的页面）：在此还原为普通文档流浅色区 */
  background: none;
  border-bottom: 0;
  backdrop-filter: none;
  position: static;
}

.page-title {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}

.page-summary {
  margin: 0;
  max-width: 760px;
  color: var(--ink-2);
  line-height: 1.9;
}

.empty {
  max-width: var(--wrap);
  margin: 0 auto;
  padding: 48px 16px;
  color: var(--ink-3);
  text-align: center;
}
</style>
