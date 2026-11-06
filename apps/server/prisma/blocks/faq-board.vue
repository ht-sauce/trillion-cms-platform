<script setup lang="ts">
/**
 * FAQ 分类页签 + 模糊搜索 + 分页（faq-board）
 *
 * 为什么需要它（ADR-055）：
 *   旧版 /faq 页尾用 post-list 铺开「核心问题详解」，条目一多就必须翻页；而 post-list 的翻页是
 *   `?page=N` 整页跳转——页面重载后视口落回页尾、浏览器滚动位置也丢，读起来非常难受。
 *   这里改成**站内切换**：分类页签 + 关键词搜索 + 分页全部在客户端完成，
 *   不刷新页面（URL 用 history.replaceState 同步，刷新/分享后仍停在同一分类与页码）。
 *
 * 与 faq-list 的分工：
 *   faq-list 是「大分类展示」橱窗——只渲染上架（featured）的问答，条数由运营在后台收敛；
 *   faq-board 是「全量索引」——已发布问答全部进这里，靠页签 + 搜索 + 分页找。
 *
 * 数据结构：{ title?, pageSize, items: [{ cat, q, a, href }] }
 *   - 页签 = items 里 cat 的去重序列（保持后台分类出现顺序）
 *   - 搜索命中范围 = 问题 + 答案摘要 + 分类（多关键词空格分隔，全部命中才算）
 *
 * 渲染口径（SEO / GEO）：
 *   所有分类的面板**全量渲染进 HTML**（非当前页签用 CSS 隐藏），保证静态产物里问答文本完整可抓，
 *   与 FAQPage 结构化数据（geo-docs 从块数据生成）一致；无 JS 时也能看到首个页签的第一页。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { BlockContext } from '@trillion/shared'

interface BoardItem {
  cat?: string
  q?: string
  a?: string
  href?: string
}

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'faq-board',
  name: 'FAQ 分类页签',
  hint: '分类页签 + 关键词搜索 + 分页（全量问答，客户端切换不刷新）',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '可留空（多数页面已由同节标题承担）' },
    { key: 'pageSize', label: '每页条数', type: 'number', hint: '默认 10' },
    {
      key: 'items',
      label: '问答',
      type: 'list',
      hint: '由后台「常见问题」自动同步：已发布问答全量写入，cat 决定它归到哪个页签',
      item: {
        type: 'group',
        fields: [
          { key: 'cat', label: '分类', type: 'text' },
          { key: 'q', label: '问题', type: 'text' },
          { key: 'a', label: '答案摘要', type: 'textarea' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})

/** 全量条目（缺 cat 的归到「其他」页签，避免数据不完整时整条丢失） */
const items = computed<BoardItem[]>(() => (Array.isArray(props.data.items) ? props.data.items : []))
const pageSize = computed(() => Math.max(1, Number(props.data.pageSize) || 10))

/** 页签：按 cat 首次出现顺序去重 */
const tabs = computed(() => {
  const list: { cat: string; items: BoardItem[] }[] = []
  for (const item of items.value) {
    const cat = String(item.cat ?? '').trim() || '其他'
    const hit = list.find((entry) => entry.cat === cat)
    if (hit) hit.items.push(item)
    else list.push({ cat, items: [item] })
  }
  return list
})

/** 当前页签（SSR 恒为第一个，挂载后按 ?fcat 修正） */
const activeCat = ref(tabs.value[0]?.cat ?? '')
/** 当前页码（按页签各自记忆：切页签回到第 1 页） */
const page = ref(1)
/** 搜索关键词（空 = 不搜索，正常按页签浏览） */
const query = ref('')
/** 搜索结果页码 */
const searchPage = ref(1)

const activeTab = computed(() => tabs.value.find((tab) => tab.cat === activeCat.value) ?? tabs.value[0])

/** 搜索命中（多关键词 AND，命中范围 = 问题 + 答案摘要 + 分类） */
const matched = computed<BoardItem[]>(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return items.value.filter((item) => {
    const hay = `${item.q ?? ''}\n${item.a ?? ''}\n${item.cat ?? ''}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
})

/** 是否处于搜索态 */
const searching = computed(() => query.value.trim().length > 0)

/** 当前页签的分页信息 */
const pageCount = computed(() => Math.max(1, Math.ceil((activeTab.value?.items.length ?? 0) / pageSize.value)))
const pages = computed(() => Array.from({ length: pageCount.value }, (_, index) => index + 1))

/** 搜索结果分页信息 */
const searchPages = computed(() => Math.max(1, Math.ceil(matched.value.length / pageSize.value)))
const pagedMatched = computed(() => {
  const start = (searchPage.value - 1) * pageSize.value
  return matched.value.slice(start, start + pageSize.value)
})

/** 页签内的条目是否落在当前页（非当前页用 CSS 收起，DOM 保留给爬虫） */
function inPage(index: number): boolean {
  return Math.floor(index / pageSize.value) + 1 === page.value
}

/** 序号补零：两位，100 以上自然进位 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 地址（无 JS 兜底：?fcat=分类&fp=页码；有 JS 时被 preventDefault 拦下走站内切换） */
function tabHref(cat: string): string {
  return `?fcat=${encodeURIComponent(cat)}`
}

function pageHref(target: number): string {
  return `?fcat=${encodeURIComponent(activeCat.value)}&fp=${target}`
}

/** 翻页 / 切页签后把视口拉回列表顶部（否则停在页尾，正是旧版的毛病） */
const boardTop = ref<HTMLElement | null>(null)
function scrollToTop() {
  if (typeof window === 'undefined') return
  boardTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 同步地址栏（replaceState：不制造历史记录，刷新 / 复制链接都能还原状态） */
function syncUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (searching.value) {
    params.set('fq', query.value.trim())
    params.delete('fcat')
    params.delete('fp')
    params.delete('fsp')
    if (searchPage.value > 1) params.set('fsp', String(searchPage.value))
    else params.delete('fsp')
  } else {
    params.delete('fq')
    params.delete('fsp')
    if (activeCat.value && activeCat.value !== tabs.value[0]?.cat) params.set('fcat', activeCat.value)
    else params.delete('fcat')
    if (page.value > 1) params.set('fp', String(page.value))
    else params.delete('fp')
  }
  const search = params.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  )
}

function selectCat(cat: string) {
  if (activeCat.value === cat && !searching.value) return
  activeCat.value = cat
  page.value = 1
  query.value = ''
  syncUrl()
  scrollToTop()
}

function goPage(target: number) {
  const total = searching.value ? searchPages.value : pageCount.value
  const next = Math.min(Math.max(target, 1), total)
  if (searching.value) searchPage.value = next
  else page.value = next
  syncUrl()
  scrollToTop()
}

/** 关键词变化：回到第 1 页并同步地址 */
function onQueryInput() {
  searchPage.value = 1
  syncUrl()
}

function clearQuery() {
  query.value = ''
  searchPage.value = 1
  syncUrl()
}

/**
 * 卡片折叠（ADR-058）：固定高度 + 可展开，判定方式与 faq-list 一致（实测 scrollHeight）。
 * key 用 `cat-index`，切换页签 / 搜索时互不干扰。
 */
const openedCards = reactive(new Set<string>())
const overflowingCards = reactive(new Set<string>())

function isOpenCard(key: string): boolean {
  return openedCards.has(key)
}

function toggleCard(key: string) {
  if (openedCards.has(key)) openedCards.delete(key)
  else openedCards.add(key)
  nextTick(() => measureCards())
}

function measureCards() {
  const nodes = boardTop.value?.querySelectorAll<HTMLElement>('[data-faq-body]')
  if (!nodes) return
  nodes.forEach((el) => {
    const key = el.dataset.faqBody || ''
    if (!key || openedCards.has(key)) return
    /** 面板隐藏时 clientHeight 为 0，不参与判定 */
    if (!el.clientHeight) return
    if (el.scrollHeight - el.clientHeight > 4) overflowingCards.add(key)
    else overflowingCards.delete(key)
  })
}

onBeforeUnmount(() => window.removeEventListener('resize', measureCards))

/** 挂载后按地址栏还原状态（SSR 产物只有默认状态，这里不触发任何请求） */
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const cat = params.get('fcat')
  const keyword = params.get('fq')
  const fp = Math.floor(Number(params.get('fp')) || 1)
  const fsp = Math.floor(Number(params.get('fsp')) || 1)

  if (cat && tabs.value.some((tab) => tab.cat === cat)) activeCat.value = cat
  if (keyword && keyword.trim()) query.value = keyword.trim()
  page.value = Math.min(Math.max(fp, 1), pageCount.value)
  searchPage.value = Math.min(Math.max(fsp, 1), searchPages.value)
  void nextTick(measureCards)
  window.addEventListener('resize', measureCards)
})

/** 切页签 / 翻页 / 搜索后重新测量（隐藏面板的 clientHeight 为 0，不能提前判定） */
watch([activeCat, page, query, searchPage], () => {
  void nextTick(measureCards)
})
</script>

<template>
  <div ref="boardTop" class="fq-board">
    <h2 v-if="data.title" class="faq-list-title">{{ data.title }}</h2>

    <div class="fq-bar">
      <nav class="faq-cats" role="tablist" aria-label="问答分类">
        <a
          v-for="tab in tabs"
          :key="tab.cat"
          :href="tabHref(tab.cat)"
          class="fq-tab"
          :class="{ on: !searching && tab.cat === activeCat }"
          role="tab"
          :aria-selected="!searching && tab.cat === activeCat"
          @click.prevent="selectCat(tab.cat)"
        >
          {{ tab.cat }}<em>{{ tab.items.length }}</em>
        </a>
      </nav>

      <div class="fq-search">
        <input
          v-model="query"
          type="search"
          :placeholder="'搜索问题或答案'"
          aria-label="搜索问题"
          @input="onQueryInput"
        />
        <button v-if="searching" type="button" class="fq-clear" @click="clearQuery">清除</button>
      </div>
    </div>

    <!-- 常规浏览：按页签分面板，非当前页签整体收起（DOM 保留，静态产物全量可抓） -->
    <template v-if="!searching">
      <div
        v-for="tab in tabs"
        :key="tab.cat"
        class="fq-panel"
        :class="{ 'fq-off': tab.cat !== activeCat }"
        role="tabpanel"
        :aria-label="tab.cat"
      >
        <article
          v-for="(item, index) in tab.items"
          :key="`${tab.cat}-${index}`"
          class="qa"
          :class="{
            'fq-off': !inPage(index),
            'qa-open': isOpenCard(`${tab.cat}-${index}`),
            'qa-clip': overflowingCards.has(`${tab.cat}-${index}`)
          }"
        >
          <NuxtLink class="qa-link" :to="item.href || '#'">
            <span class="qidx">{{ pad(index + 1) }}</span>
            <span class="qt">{{ item.q }}</span>
            <i class="arw" aria-hidden="true"></i>
          </NuxtLink>
          <!-- eslint-disable-next-line vue/no-v-html -- h 已在服务端白名单化（仅 p/ol/ul/li/行内标记） -->
          <div v-if="item.h" class="ans" :data-faq-body="`${tab.cat}-${index}`" v-html="item.h" />
          <div v-else class="ans" :data-faq-body="`${tab.cat}-${index}`">{{ item.a }}</div>
          <button
            v-if="overflowingCards.has(`${tab.cat}-${index}`)"
            type="button"
            class="ans-toggle"
            @click="toggleCard(`${tab.cat}-${index}`)"
          >
            {{ isOpenCard(`${tab.cat}-${index}`) ? '收起' : '展开' }}
          </button>
        </article>

        <nav v-if="tab.items.length > pageSize" class="pager" aria-label="分页">
          <a
            v-for="target in pages"
            :key="target"
            :href="pageHref(target)"
            :class="{ on: tab.cat === activeCat && target === page }"
            :aria-current="tab.cat === activeCat && target === page ? 'page' : undefined"
            @click.prevent="tab.cat === activeCat ? goPage(target) : selectCat(tab.cat)"
          >
            {{ target }}
          </a>
        </nav>
      </div>
    </template>

    <!-- 搜索态：跨分类命中结果，按同一套分页 -->
    <div v-else class="fq-panel">
      <p class="fq-hit">
        匹配 <b>{{ matched.length }}</b> 条问答<span v-if="matched.length">（关键词：{{ query.trim() }}）</span>
      </p>

      <article
        v-for="(item, index) in pagedMatched"
        :key="`hit-${index}`"
        class="qa"
        :class="{ 'qa-open': isOpenCard(`hit-${index}`), 'qa-clip': overflowingCards.has(`hit-${index}`) }"
      >
        <NuxtLink class="qa-link" :to="item.href || '#'">
          <span class="qidx">{{ pad((searchPage - 1) * pageSize + index + 1) }}</span>
          <span class="qt"
            >{{ item.q }}<span v-if="item.cat" class="fq-cat">{{ item.cat }}</span></span
          >
          <i class="arw" aria-hidden="true"></i>
        </NuxtLink>
        <!-- eslint-disable-next-line vue/no-v-html -- 同上 -->
        <div v-if="item.h" class="ans" :data-faq-body="`hit-${index}`" v-html="item.h" />
        <div v-else class="ans" :data-faq-body="`hit-${index}`">{{ item.a }}</div>
        <button
          v-if="overflowingCards.has(`hit-${index}`)"
          type="button"
          class="ans-toggle"
          @click="toggleCard(`hit-${index}`)"
        >
          {{ isOpenCard(`hit-${index}`) ? '收起' : '展开' }}
        </button>
      </article>

      <p v-if="!matched.length" class="fq-empty">没有匹配的问答，换个关键词试试。</p>

      <nav v-if="matched.length > pageSize" class="pager" aria-label="搜索结果分页">
        <a
          v-for="target in searchPages"
          :key="target"
          href="#"
          :class="{ on: target === searchPage }"
          :aria-current="target === searchPage ? 'page' : undefined"
          @click.prevent="goPage(target)"
        >
          {{ target }}
        </a>
      </nav>
    </div>
  </div>
</template>

<style>
/* 块内类名一律带 fq- 前缀：scoped 只能挡住本块样式外泄，挡不住全局 CSS 按类名命中本块 */
/* 站内翻页 / 切页签后 scrollIntoView 到本块顶部；留出吸顶头高度，否则页签被压在导航条下面（site.css 既有口径 92px） */
.fq-board {
  scroll-margin-top: 92px;
}

.fq-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.fq-board .faq-cats {
  margin-bottom: 0;
}

/* 页签激活态：沿用图纸白主题的描边 + 品牌淡底 */
.fq-board .faq-cats a.on {
  border-color: var(--teal);
  color: var(--teal-dk);
  background: var(--teal-lt);
  font-weight: 700;
}

.fq-search {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fq-search input {
  width: 240px;
  max-width: 60vw;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper, #fff);
  color: var(--ink);
  font-size: 13px;
  outline: none;
  transition: border-color 0.16s;
}

.fq-search input:focus {
  border-color: var(--teal);
}

.fq-clear {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink-2);
  font-size: 12.5px;
  cursor: pointer;
}

.fq-clear:hover {
  border-color: var(--teal);
  color: var(--teal-dk);
}

/* 收起 = 不渲染占位（display:none 仍保留在 HTML 里，爬虫与结构化数据口径一致） */
.fq-off {
  display: none;
}

/**
 * 卡片答案（ADR-058）：固定高度 + 可展开，富文本结构（段落 / 列表）完整保留。
 * 高度按 3 行取，超出裁掉并底部渐隐；展开后自适应。
 */
.fq-board .qa .ans {
  position: relative;
  max-height: 5.9em;
  overflow: hidden;
  transition: max-height 0.18s ease;
}

.fq-board .qa.qa-clip:not(.qa-open) .ans::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.4em;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 78%);
  pointer-events: none;
}

.fq-board .qa.qa-open .ans {
  max-height: none;
}

.fq-board .qa .ans p {
  margin: 0 0 10px;
}

.fq-board .qa .ans p:last-child {
  margin-bottom: 0;
}

.fq-board .qa .ans ol,
.fq-board .qa .ans ul {
  margin: 0 0 10px;
  padding-left: 1.4em;
}

.fq-board .qa .ans ol {
  list-style: decimal;
}

.fq-board .qa .ans ul {
  list-style: disc;
}

.fq-board .qa .ans li {
  margin-bottom: 6px;
}

.fq-board .qa .ans li:last-child {
  margin-bottom: 0;
}

.ans-toggle {
  display: block;
  margin: 8px 20px 14px auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--teal-dk);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.ans-toggle:hover {
  text-decoration: underline;
}

.fq-hit {
  font-size: 12.8px;
  color: var(--ink-3);
  margin-bottom: 12px;
}

.fq-hit b {
  color: var(--teal-dk);
  font-family: var(--mono, ui-monospace, Menlo, Consolas, monospace);
}

.fq-empty {
  padding: 18px 0 6px;
  font-size: 13.2px;
  color: var(--ink-3);
}

.fq-cat {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--teal-lt);
  border: 1px solid #bfe9e3;
  color: #0b5a54;
  vertical-align: 1px;
}

@media (max-width: 640px) {
  .fq-search input {
    width: 100%;
  }

  .fq-search {
    width: 100%;
  }
}
</style>
