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

const { site, load, navigationOf } = useSite()
await load()

const route = useRoute()

const menuExpanded = ref(false)

/** 路由切换后自动收起移动端导航 */
watch(
  () => route.fullPath,
  () => {
    menuExpanded.value = false
  }
)

const headerItems = computed(() => navigationOf('header')?.items ?? [])
const footerGroups = computed(() =>
  ['footer-1', 'footer-2', 'footer-3', 'footer-4']
    .map((key) => navigationOf(key))
    .filter((group): group is NonNullable<typeof group> => Boolean(group))
)

/** 门诊时间一行文本（页脚 NAP 用） */
const openingHoursText = computed(() => {
  const hours = site.value?.openingHours || []
  if (!hours.length) return null
  return hours
    .map((rule) => `${rule.weekday} ${rule.open}-${rule.close}${rule.note ? `，${rule.note}` : ''}`)
    .join('；')
})
</script>

<template>
  <div class="site-shell">
    <!--
      预览态提示不在此渲染：站点页面在 iframe 内，提示条会把站点外观顶下去，
      预览态提示统一由管理后台（内容编辑器）在画布头部展示（09 §7.5）
    -->
    <FrameTopBar :opening-hours="site?.openingHours || []" :phone="site?.phone || null" />

    <FrameSiteHeader
      :common-name="site?.commonName || site?.name || '站点'"
      :subtitle="site?.logoSubtitle || ''"
      :mark-text="site?.logoMark || ''"
      :items="headerItems"
      :expanded="menuExpanded"
      :current-path="route.path"
      @toggle="menuExpanded = !menuExpanded"
    />

    <main class="site-main">
      <slot />
    </main>

    <FrameSiteFooter
      :legal-name="site?.legalName || site?.name || ''"
      :common-name="site?.commonName || site?.name || ''"
      :practice-scopes="site?.practiceScopes || []"
      :credit-code="site?.creditCode || null"
      :clinic-reg-no="site?.clinicRegNo || null"
      :issuing-authority="site?.issuingAuthority || null"
      :address-full="site?.addressFull || null"
      :phone="site?.phone || null"
      :opening-hours-text="openingHoursText"
      :icp-number="site?.icpNumber || null"
      :police-number="site?.policeNumber || null"
      :medical-insurance="site?.medicalInsurance || false"
      :insurance-note="site?.insuranceNote || null"
      :groups="footerGroups"
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
