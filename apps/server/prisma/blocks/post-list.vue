<script setup lang="ts">
/**
 * 新闻列表（原型 `.post` + `.posts`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 * 原型 DOM 对应 99-blocks.html `blk-post / posts`：.posts > a.post*(div.pd + div.pc > h4 + p)。
 * 2026-10-15 起不再输出首条 lead-post 大卡（h3 + 渐变底）：列表按发布日期倒序，
 * 新增文章恒排最前、永远命中大卡样式，与既有条目的字号 / 对齐不一致；
 * 全部条目统一普通卡（h4）样式，site.css 中 .lead-post 样式保留但不再使用。
 *
 * 数据字段：items[{title, summary, publishDate, href}]（新闻去分类，不再有 category / ptag）
 *
 * 分页（客户端）：pageSize 默认 10；SSG / SSR 初始只渲染第 1 页，
 * window 访问只在 onMounted 里解析 location.search 的 page 参数后对 items 切片。
 * 分页导航复用原型 `.pager` 结构与类名（当前页 `.on`），链接为 `?page=N` 相对地址，
 * 用原生 <a> 触发整页跳转——静态托管下无需客户端路由参与，页面重新执行 onMounted 即翻页。
 */
import { computed, onMounted, ref } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 全量条目 */
const items = computed(() => (Array.isArray(props.data.items) ? props.data.items : []))

/** 每页条数（默认 10） */
const pageSize = computed(() => Number(props.data.pageSize) || 10)

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize.value)))

/** 当前页（SSG / SSR 恒为第 1 页，挂载后按 ?page= 修正并钳制在有效范围内） */
const currentPage = ref(1)

onMounted(() => {
  const page = Math.floor(Number(new URLSearchParams(window.location.search).get('page')) || 1)
  currentPage.value = Math.min(Math.max(page, 1), pageCount.value)
})

/** 当前页切片 */
const pageItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return items.value.slice(start, start + pageSize.value)
})

/** 页码项：第 1 页不带参数，其余为 ?page=N（相对链接按当前路径解析） */
const pages = computed(() =>
  Array.from({ length: pageCount.value }, (_, index) => {
    const page = index + 1
    return { page, href: page === 1 ? '?' : `?page=${page}`, active: page === currentPage.value }
  })
)

defineBlock({
  key: 'post-list',
  name: '新闻列表',
  hint: '新闻 / 资讯列表：统一条目卡片，超过每页条数时显示分页',
  fields: [
    { key: 'pageSize', label: '每页条数', type: 'number', hint: '默认 10' },
    {
      key: 'items',
      label: '文章',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'title', label: '标题', type: 'text' },
          { key: 'summary', label: '摘要', type: 'textarea' },
          { key: 'publishDate', label: '发布日期', type: 'text' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <template v-if="pageItems.length">
    <div class="posts">
      <NuxtLink v-for="item in pageItems" :key="item.title" class="post" :to="item.href || '#'">
        <div class="pd">{{ item.publishDate }}</div>
        <div class="pc">
          <h4>{{ item.title }}</h4>
          <p v-if="item.summary">{{ item.summary }}</p>
        </div>
      </NuxtLink>
    </div>

    <nav v-if="items.length > pageSize" class="pager" aria-label="分页">
      <a
        v-for="item in pages"
        :key="item.page"
        :href="item.href"
        :class="{ on: item.active }"
        :aria-current="item.active ? 'page' : undefined"
      >
        {{ item.page }}
      </a>
    </nav>
  </template>
</template>
