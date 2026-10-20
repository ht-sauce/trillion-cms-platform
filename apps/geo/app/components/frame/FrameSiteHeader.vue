<script setup lang="ts">
/**
 * 框架块 · 头部（09 §7.1）
 *
 * DOM 与类名对齐设计稿原型 01-index.html（09 §7.4.1 / ADR-036）：
 *   <header><div class="wrap head">
 *     <a class="logo"><div class="mark">仁</div>
 *       <div><div class="n">机构名</div><div class="s">英文副标</div></div></a>
 *     <button class="navtoggle">☰</button>
 *     <nav class="mainnav"><a class="on">首页</a>…</nav>
 *   </div></header>
 * 样式全部来自原型 `theme-b.css`（`.head/.logo/.mark/.n/.s/nav.mainnav/.navtoggle`），本组件不写样式。
 *
 * 与原型一致：头部**只有** LOGO + 汉堡 + 主导航，**不设 CTA 按钮**
 *   （原型注释明确「对齐参考站，无 CTA 按钮」）；电话与预约入口在门诊条与页脚。
 *
 * 导航是**独立配置**，不从内容树推导（ADR-029）——这里只按配置顺序渲染。
 */
import type { NavigationItem } from '../../composables/useSite'

const props = defineProps<{
  commonName: string
  /** 英文副标（原型 `.logo .s`，如「XARA · VITILIGO SPECIALTY」） */
  subtitle: string
  /** LOGO 方形标记内的单字（原型 `.logo .mark`，如「仁」）；缺省取机构名首字 */
  markText: string
  items: NavigationItem[]
  /** 移动端展开态由父级（布局）控制，避免每个框架块各写一套交互 */
  expanded: boolean
  /** 当前页面路径，用于给导航项加 `.on`（原型用 `.on` 表示当前项） */
  currentPath: string
}>()

defineEmits<{ toggle: [] }>()

/** LOGO 标记字：优先用传入的 markText，否则取机构名首字 */
const mark = computed(() => props.markText || props.commonName.slice(0, 1))

/** 导航项是否为当前页（原型 `.on`）；精确匹配或该栏目下的子页 */
function isActive(item: NavigationItem): boolean {
  const target = item.pagePath || item.href
  if (!target) return false
  if (target === '/') return props.currentPath === '/'
  return props.currentPath === target || props.currentPath.startsWith(`${target}/`)
}
</script>

<template>
  <header>
    <div class="wrap head">
      <NuxtLink to="/" class="logo">
        <div class="mark">{{ mark }}</div>
        <div>
          <div class="n">{{ commonName }}</div>
          <div v-if="subtitle" class="s">{{ subtitle }}</div>
        </div>
      </NuxtLink>

      <button class="navtoggle" type="button" :aria-expanded="expanded" aria-label="展开导航" @click="$emit('toggle')">
        &#9776;
      </button>

      <nav class="mainnav" :class="{ open: expanded }" aria-label="主导航">
        <NuxtLink
          v-for="item in items"
          :key="item.id"
          :to="item.pagePath || item.href || '/'"
          :class="{ on: isActive(item) }"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
