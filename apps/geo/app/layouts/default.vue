<script setup lang="ts">
/**
 * 站点布局：门诊信息条 + 头部导航 + 内容区 + 全站导览页脚（09 §7.1）
 *
 * 这四个「框架块」每页固定挂载、不进页面 blocks 数组——
 * 它们是站点的骨骼，改一次全站生效；内容区才是每页不同的部分。
 *
 * 合规与可信度相关的要素全部落在这里：备案号、工商全称、NAP、免责声明，
 * 这些不是页脚装饰，而是搜索引擎判定「这是一个真实机构」的依据。
 *
 * ⚠️ 站点主题令牌的 `:root` 注入在 `app.vue`（含派生变量与别名），此处不重复注入。
 *   移动端导航由原型 `nav.mainnav.open` 的 CSS 断点（≤1140px）接管，
 *   **不再另建 `.mobile-nav`**（那是自创结构，与设计稿不一致）。
 */
import { useSite } from '../composables/useSite'
import { useCurrentPath } from '../composables/usePage'

const { site, load, navigationOf } = useSite()
await load()

const route = useRoute()

/** 导航高亮用的当前路径：统一入口（剥站点前缀 + 归一化），见 useCurrentPath */
const navCurrentPath = useCurrentPath()

const menuExpanded = ref(false)

/** 路由切换后自动收起移动端导航 */
watch(
  () => route.fullPath,
  () => {
    menuExpanded.value = false
  }
)

const headerItems = computed(() => navigationOf('header')?.items ?? [])

/**
 * 页脚只留一行版权条（2026-11-03）：不再读页脚导航分组，也不再拼门诊/营业时间 ——
 * 导航入口全部在页头，营业时间在公司简介与联系页，页脚重复一遍只是拉长页面。
 */
</script>

<template>
  <div class="site-shell">
    <!--
      预览态提示不在此渲染：站点页面在 iframe 内，提示条会把站点外观顶下去，
      预览态提示统一由管理后台（内容编辑器）在画布头部展示（09 §7.5）
    -->
    <FrameTopBar
      :opening-hours="site?.openingHours || []"
      :phone="site?.phone || null"
      :business-type="site?.businessType || 'medical'"
    />

    <FrameSiteHeader
      :common-name="site?.commonName || site?.name || '站点'"
      :subtitle="site?.logoSubtitle || ''"
      :mark-text="site?.logoMark || ''"
      :items="headerItems"
      :expanded="menuExpanded"
      :current-path="navCurrentPath"
      @toggle="menuExpanded = !menuExpanded"
    />

    <main class="site-main">
      <slot />
    </main>

    <FrameSiteFooter
      :legal-name="site?.legalName || site?.name || ''"
      :common-name="site?.commonName || site?.name || ''"
      :phone="site?.phone || null"
      :icp-number="site?.icpNumber || null"
      :address-full="site?.addressFull || null"
      :credit-code="site?.creditCode || null"
    />
  </div>
</template>

<style scoped lang="scss">
/** 站点外壳：让页脚在内容不足时也贴底（原型无此约束，属渲染引擎的布局兜底） */
.site-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.site-main {
  flex: 1;
  width: 100%;
}
</style>
