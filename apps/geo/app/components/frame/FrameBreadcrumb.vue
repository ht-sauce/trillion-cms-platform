<script setup lang="ts">
/**
 * 框架块 · 面包屑（09 §7.1）
 *
 * 完全由 `page.path` + `channel.ancestors` 派生，不单独维护一份层级数据——
 * 这样「改名 / 移动目录」不会让面包屑与实际 URL 脱节。
 *
 * 样式对齐设计稿原型（09 §7.4.1）：外层 `.crumb` + 内层 `.wrap`，分隔符 `.sep` 为「／」。
 * 原型用的是 `<div>`，但 **03 §4.2 要求面包屑固定 `<nav><ol><li>`**（GEO 硬约束），
 * 故这里保持语义标签、复用原型的类名与视觉（`.crumb` 的样式对 `nav` 同样生效）。
 * 原型形态：`首页 ／ [栏目] ／ 当前页`，其中当前页是 `<span>`（非链接），首页恒为链接。
 *
 * ⚠️ 注意：原型 `.crumb .wrap` 是 `display:flex` 的单行容器，
 *   这里用 `<ol>` 承载时需让其 `display:contents`（见下方 style），否则 flex 会套两层。
 */
interface Crumb {
  name: string
  path: string
}

const props = defineProps<{
  pageTitle: string
  pagePath: string
  ancestors: Crumb[]
  channelName: string | null
  channelPath: string | null
}>()

const crumbs = computed<Crumb[]>(() => {
  const list: Crumb[] = [{ name: '首页', path: '/' }]
  for (const item of props.ancestors || []) list.push(item)
  if (props.channelPath && props.channelPath !== '/' && !list.some((item) => item.path === props.channelPath)) {
    list.push({ name: props.channelName || props.channelPath, path: props.channelPath })
  }
  return list
})

/** 首页本身不需要面包屑 */
const visible = computed(() => props.pagePath !== '/' && crumbs.value.length > 0)

/**
 * 栏目落地页（如 /doctors 的 channelPath === pagePath）时，循环里最后一项
 * 已经是当前页（渲染为 span），不能再追加 pageTitle，否则出现「医师团队 医师团队」重复。
 */
const lastIsCurrent = computed(() => crumbs.value[crumbs.value.length - 1]?.path === props.pagePath)
</script>

<template>
  <nav v-if="visible" class="crumb" aria-label="面包屑">
    <div class="wrap">
      <ol class="crumb-list tabular">
        <li v-for="(crumb, index) in crumbs" :key="`${crumb.path}-${index}`" class="crumb-item">
          <NuxtLink v-if="crumb.path !== pagePath" :to="crumb.path">{{ crumb.name }}</NuxtLink>
          <span v-else aria-current="page">{{ crumb.name }}</span>
          <span v-if="index < crumbs.length - 1" class="sep">／</span>
        </li>
        <li v-if="!lastIsCurrent" class="crumb-item current" aria-current="page">
          <span>{{ pageTitle }}</span>
        </li>
      </ol>
    </div>
  </nav>
</template>

<style lang="scss">
/**
 * 唯一补充：把 `<ol>` 与 `<li>` 变成透明容器，让原型 `.crumb .wrap` 的 flex 直接作用在项上，
 * 视觉与原型完全一致（原型里项是 `.wrap` 的直接子元素）。
 * 其余（底色、字号、`.sep` 颜色、hover）全部来自原型 `theme-b.css`。
 */
.crumb .crumb-list {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}

.crumb .crumb-item {
  display: contents;
}
</style>
