<script setup lang="ts">
/**
 * GEO 项目根组件
 *
 * 站点主题令牌来自站点配置（`themeTokens`），通过 CSS 变量注入，
 * 与后台的 Element Plus 主题完全解耦（09 §7.4）——后台换主色不会让线上站点变色。
 *
 * 站点样式层（09 §7.4.1 / ADR-036）：
 *   设计稿原型样式 `theme-b.css` + `site.css` 原样落地在 `public/assets/css/`，
 *   这里以 `<link>` 引入（public/ 不参与 Vite 打包，只能用 link 而非 import）。
 *   令牌变量名与原型 `:root` 同名（含 `--r-sm/md/lg`），故原型 CSS 零改动即读到站点品牌色。
 */
import { useSite } from './composables/useSite'
import { usePreview } from './composables/usePreview'
import { themeRootCss, themeDerivedCss } from './utils/theme'
import { parseHeadExtra, toHeadGroups } from './utils/head-extra'

const { site, load } = useSite()
await load()

const preview = usePreview()

/** 站点级 head 扩展（净化后的 meta / link，服务端已剔除脚本） */
const headExtra = computed(() => toHeadGroups(parseHeadExtra(site.value?.headExtra)))

useHead({
  htmlAttrs: { lang: site.value?.defaultLocale || 'zh-CN' },
  titleTemplate: (title?: string) =>
    title
      ? `${title} | ${site.value?.commonName || site.value?.name || ''}`
      : site.value?.seoTitle || site.value?.name || '',
  link: [
    { rel: 'stylesheet', href: '/assets/css/theme-b.css' },
    { rel: 'stylesheet', href: '/assets/css/site.css' },
    { rel: 'stylesheet', href: '/assets/css/geo-site-bridge.css' },
    ...(site.value?.faviconUrl ? [{ rel: 'icon', href: site.value.faviconUrl }] : []),
    ...headExtra.value.link
  ],
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }, ...headExtra.value.meta],
  /**
   * 站点令牌注入 :root（09 §7.4 ① ② ③）：
   *   ① 受管令牌（站点可配）→ themeRootCss
   *   ② 设计稿派生变量（不进 SiteThemeTokens）→ themeDerivedCss
   *   ③ 短名别名 --r-sm/md/lg → 指回 --radius-sm/md/lg
   *   顺序固定：派生与别名先注入，受管令牌后注入（站点可配项优先，不被覆盖）
   */
  style: [{ innerHTML: themeDerivedCss() }, { innerHTML: themeRootCss(site.value?.themeTokens) }]
})
</script>

<template>
  <div class="geo-root" :data-preview="preview.isPreview ? 'true' : undefined">
    <!-- NuxtLayout 必须显式使用：否则 pages 里的 definePageMeta({ layout }) 不生效，站点页头/页脚不会渲染 -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style lang="scss">
/**
 * 全局基线
 *
 * ⚠️ 原型 `theme-b.css` 已自带 reset（`*{box-sizing;margin:0;padding:0}`、
 * `body{font-family;color;background;font-size:14px;line-height:1.7}`、`a`、`img`），
 * 且它是**唯一外观真源**（ADR-036）。本处因此**不再重复声明**这些属性，
 * 以免与原型 CSS 打架（此前 `body{font-size:15px}` 覆盖了原型的 14px，是全站字号偏大的原因）。
 * 这里只保留原型未覆盖、且渲染引擎必需的最小补充。
 */
:root {
  --wrap: 1180px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
}

/** 数字统一等宽（与后台密度规范一致，避免表格/统计数字跳动） */
time,
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
