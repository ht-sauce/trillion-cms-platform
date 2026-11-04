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
 * 数据字段：items[{title, summary, publishDate, href, cover?}]（新闻去分类，不再有 category / ptag）
 * 2026-11-04（ADR-053）：条目增加 `cover` 封面缩略图（素材库 publicUrl）；有封面时
 * `.post` 变三列（日期 / 缩略图 / 文本），无封面维持两列，问答列表等其他用法零影响。
 * 2026-11-04（ADR-055）：增加 `searchable`（默认关闭）——列表上方给一个关键词搜索框，
 * 按标题 + 摘要模糊过滤（多关键词空格分隔、全部命中）；分页由「整页跳转」改为站内切换：
 * 静态产物仍只渲染第 1 页，地址栏 `?page=N&q=关键词` 由 history.replaceState 同步，
 * 翻页后视口滚回列表顶部（旧行为是整页刷新后落回页尾，读起来很别扭）。
 */
import { computed, onMounted, ref } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 全量条目 */
const items = computed(() => (Array.isArray(props.data.items) ? props.data.items : []))

/** 每页条数（默认 10） */
const pageSize = computed(() => Number(props.data.pageSize) || 10)

/** 是否提供关键词搜索（新闻列表页开启，其他复用场景默认关闭） */
const searchable = computed(() => Boolean(props.data.searchable))

/** 关键词（挂载后按 ?q= 还原） */
const keyword = ref('')

/** 过滤后的条目：无关键词即全量 */
const filtered = computed(() => {
  const terms = keyword.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return items.value
  return items.value.filter((item: Record<string, any>) => {
    const hay = `${item.title ?? ''}\n${item.summary ?? ''}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
})

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

/** 当前页（SSG / SSR 恒为第 1 页，挂载后按 ?page= 修正并钳制在有效范围内） */
const currentPage = ref(1)

/** 当前页切片 */
const pageItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/** 页码项（第 1 页不带参数，其余为 ?page=N；href 保留给无 JS 场景） */
const pages = computed(() =>
  Array.from({ length: pageCount.value }, (_, index) => {
    const page = index + 1
    return { page, href: page === 1 ? '?' : `?page=${page}`, active: page === currentPage.value }
  })
)

/** 翻页后把视口拉回列表顶部（整页刷新时浏览器会把视口留在页尾） */
const listTop = ref<HTMLElement | null>(null)
function scrollToTop() {
  if (typeof window === 'undefined') return
  listTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 地址栏同步：保留其他块可能写入的参数，只维护 page / q */
function syncUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (keyword.value.trim()) params.set('q', keyword.value.trim())
  else params.delete('q')
  if (currentPage.value > 1) params.set('page', String(currentPage.value))
  else params.delete('page')
  const search = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

function goPage(target: number) {
  const next = Math.min(Math.max(target, 1), pageCount.value)
  if (next === currentPage.value) return
  currentPage.value = next
  syncUrl()
  scrollToTop()
}

function onQueryInput() {
  currentPage.value = 1
  syncUrl()
}

function clearQuery() {
  keyword.value = ''
  onQueryInput()
}

defineBlock({
  key: 'post-list',
  name: '新闻列表',
  hint: '新闻 / 资讯列表：统一条目卡片（可选封面缩略图），超过每页条数时显示分页',
  fields: [
    { key: 'pageSize', label: '每页条数', type: 'number', hint: '默认 10' },
    {
      key: 'searchable',
      label: '关键词搜索',
      type: 'switch',
      hint: '开启后在列表上方显示搜索框，按标题 + 摘要模糊过滤'
    },
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
          { key: 'href', label: '链接', type: 'url' },
          { key: 'cover', label: '封面图', type: 'file', hint: '素材库地址（/static/...）；留空则无缩略图' }
        ]
      }
    }
  ]
})

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const query = params.get('q')
  if (query && query.trim()) keyword.value = query.trim()
  const page = Math.floor(Number(params.get('page')) || 1)
  currentPage.value = Math.min(Math.max(page, 1), pageCount.value)
})
</script>

<template>
  <div ref="listTop" class="post-list">
    <div v-if="searchable" class="pl-search">
      <input v-model="keyword" type="search" placeholder="搜索标题或摘要" aria-label="搜索新闻" @input="onQueryInput" />
      <button v-if="keyword.trim()" type="button" class="pl-clear" @click="clearQuery">清除</button>
    </div>

    <p v-if="searchable && keyword.trim()" class="pl-hit">
      匹配 <b>{{ filtered.length }}</b> 篇<span v-if="filtered.length">（关键词：{{ keyword.trim() }}）</span>
    </p>

    <div v-if="pageItems.length" class="posts">
      <NuxtLink
        v-for="item in pageItems"
        :key="item.title"
        class="post"
        :class="{ 'has-cover': Boolean(item.cover) }"
        :to="item.href || '#'"
      >
        <div class="pd">{{ item.publishDate }}</div>
        <figure v-if="item.cover" class="pthumb">
          <img :src="item.cover" :alt="item.title" loading="lazy" decoding="async" />
        </figure>
        <div class="pc">
          <h4>{{ item.title }}</h4>
          <p v-if="item.summary">{{ item.summary }}</p>
        </div>
      </NuxtLink>
    </div>

    <p v-else-if="searchable && keyword.trim()" class="pl-empty">没有匹配的新闻，换个关键词试试。</p>

    <nav v-if="filtered.length > pageSize" class="pager" aria-label="分页">
      <a
        v-for="item in pages"
        :key="item.page"
        :href="item.href"
        :class="{ on: item.active }"
        :aria-current="item.active ? 'page' : undefined"
        @click.prevent="goPage(item.page)"
      >
        {{ item.page }}
      </a>
    </nav>
  </div>
</template>

<style>
/* 块内类名带 pl- 前缀（post-list → pl），避免与全局样式按类名撞车 */
/* 翻页后 scrollIntoView 到列表顶部；留出吸顶头高度（site.css 既有口径 92px） */
.post-list {
  scroll-margin-top: 92px;
}

.pl-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.pl-search input {
  width: 280px;
  max-width: 70vw;
  height: 36px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font-size: 13.2px;
  outline: none;
  transition: border-color 0.16s;
}

.pl-search input:focus {
  border-color: var(--teal);
}

.pl-clear {
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink-2);
  font-size: 12.5px;
  cursor: pointer;
}

.pl-clear:hover {
  border-color: var(--teal);
  color: var(--teal-dk);
}

.pl-hit,
.pl-empty {
  font-size: 12.8px;
  color: var(--ink-3);
  margin-bottom: 12px;
}

.pl-hit b {
  color: var(--teal-dk);
  font-family: var(--mono, ui-monospace, Menlo, Consolas, monospace);
}

@media (max-width: 640px) {
  .pl-search,
  .pl-search input {
    width: 100%;
  }
}
</style>
