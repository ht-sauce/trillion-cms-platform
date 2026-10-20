<script setup lang="ts">
/**
 * 分页（原型 `.pager`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.pager`）：
 *   .pager > a / span（当前页用 `.on`）
 *
 * 设计稿硬约束：
 * 1. 纯 SSG 不做交互翻页 —— 每页都是真实链接，用 `<nav aria-label="分页">` 包裹；
 * 2. 页码由 total / pageSize 派生，第 1 页链接为 basePath 本身，其余为 basePath?page=N；
 * 3. 数据不足一页时不渲染，避免出现孤零零的「1」。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 总页数，参数缺失时按 1 页处理 */
const pageCount = computed(() => {
  const total = Number(props.data.total) || 0
  const size = Number(props.data.pageSize) || 10
  return Math.max(1, Math.ceil(total / size))
})

/** 当前页，钳制在 1 ~ pageCount 之间 */
const currentPage = computed(() => {
  const current = Number(props.data.current) || 1
  return Math.min(Math.max(current, 1), pageCount.value)
})

/** 页码项：{ page, href, active }，第 1 页不加 query */
const pages = computed(() => {
  const base = props.data.basePath || '/'
  return Array.from({ length: pageCount.value }, (_, index) => {
    const page = index + 1
    return {
      page,
      href: page === 1 ? base : `${base}${base.includes('?') ? '&' : '?'}page=${page}`,
      active: page === currentPage.value
    }
  })
})

defineBlock({
  key: 'pager',
  name: '分页',
  hint: '普通分页链接，点击页码跳转到对应页面',
  fields: [
    { key: 'total', label: '总条数', type: 'number', hint: '列表一共有多少条内容' },
    { key: 'current', label: '当前页', type: 'number', hint: '从 1 开始' },
    { key: 'pageSize', label: '每页条数', type: 'number', hint: '默认 10' },
    { key: 'basePath', label: '基础路径', type: 'text', hint: '如 /doctors' }
  ]
})
</script>

<template>
  <nav v-if="pageCount > 1" class="pager" aria-label="分页">
    <NuxtLink
      v-for="item in pages"
      :key="item.page"
      :to="item.href"
      :class="{ on: item.active }"
      :aria-current="item.active ? 'page' : undefined"
    >
      {{ item.page }}
    </NuxtLink>
  </nav>
</template>
