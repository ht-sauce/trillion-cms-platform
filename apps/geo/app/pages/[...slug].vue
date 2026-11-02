<script setup lang="ts">
/**
 * 通用页面路由：按栏目 / 页面 slug 渲染（栏目为目录，功能块层级）
 */
import { normalizePagePath } from '../composables/usePage'

definePageMeta({ layout: 'default' })

const route = useRoute()
const raw = Array.isArray(route.params.slug) ? route.params.slug.join('/') : String(route.params.slug || '')
/** 归一化：`/about/` 的 catch-all 可能解析出 `['about','']`，不归一化会与 SSR 的 key 错位 */
const path = computed(() => normalizePagePath(`/${raw}`))
</script>

<template>
  <PageRender :path="path" />
</template>
