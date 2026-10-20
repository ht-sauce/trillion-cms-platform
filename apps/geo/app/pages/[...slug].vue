<script setup lang="ts">
/**
 * 通用页面路由：按栏目 / 页面 slug 渲染（栏目为目录，功能块层级）
 */
definePageMeta({ layout: 'default' })

const route = useRoute()
const raw = Array.isArray(route.params.slug) ? route.params.slug.join('/') : String(route.params.slug || '')
const path = computed(() => `/${raw}`)
</script>

<template>
  <PageRender :path="path" />
</template>
