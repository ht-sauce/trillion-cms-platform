<script setup lang="ts">
/**
 * 通用页面路由：按栏目 / 页面 slug 渲染（栏目为目录，功能块层级）
 */
import { useCurrentPath } from '../composables/usePage'

definePageMeta({ layout: 'default' })

/**
 * 页面路径统一走 useCurrentPath（剥站点前缀 + 归一化）。
 * 历史教训：这里曾用 `params.slug` 拼接 + normalize，前缀形态下
 * params 会把 `/forintech` 也吃进 slug，靠 usePage 内部二次剥前缀兜底；
 * 收敛到统一入口后不再依赖调用方自觉。
 */
const path = useCurrentPath()
</script>

<template>
  <PageRender :path="path" />
</template>
