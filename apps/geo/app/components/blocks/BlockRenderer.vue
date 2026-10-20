<script setup lang="ts">
/**
 * Block 渲染器：把页面 blocks 数组渲染成块组件序列（09 §4.3 / §7.2）
 *
 * 与旧实现的根本区别：
 *   旧实现用 `v-if="block.type === 'hero'"` 硬编码分发——**新增块必须改这个文件**，
 *   块代码化后块由后台创建，渲染器不可能认识所有 key，因此改为按 key 动态解析组件。
 *
 * 解析方式：`import.meta.glob` 在构建期把 `components/blocks/Blk*.vue` 收成一张表，
 *   运行时按 `Blk<PascalCase(key)>` 取用。相比 `resolveComponent`，
 *   这里的失败是**显式可见**的（渲染成「缺失块」占位），而不是静默空白。
 *
 * 缺失块的处理是刻意的：块被删了、或代码编译失败没落盘时，
 *   线上页面必须显示「这个块不可用」——静默跳过会让运营以为内容还在。
 */
import type { BlockContext, BlockInstance } from '@trillion/shared'
import { blockKeyToPascal } from '@trillion/shared'

const props = defineProps<{
  blocks: BlockInstance[]
  /** 块渲染上下文（站点 / 页面 / 目录 / 实体，见 09 §5） */
  context: BlockContext
}>()

/**
 * 页面节奏清单（ADR-036 补充）：
 *   设计稿把页面纵向节奏放在每个 `<section>` 上（56px 内边距、`.alt` 灰底带）。
 *   CMS 的块只描述「这一段内容长什么样」，不描述「它在页面节奏里的位置」——
 *   所以节奏属于**页面级编排**：块实例可携带 `section` 提示（页面级，非块字段），
 *   没有提示时按下表取默认值，保证新增块不会漏掉整页节奏。
 *
 *   'plain'       —— `<section class="site-section">`（白底）
 *   'alt'         —— `<section class="site-section alt">`（灰底带，按设计稿逐页指定）
 *   'plain-flush' —— 白底且贴住上一段（padding-top:0，如页底 telbar）
 *   'alt-flush'   —— 灰底带且贴住上一段（如 FAQ 页的锚点区）
 *   'head'        —— 仅标题行（无后随内容时的兜底；正常情况与内容块合并，见下）
 *   'none'        —— 不包 section：页头块（hero 自带 section）、面包屑
 */
const SECTION_OF: Record<string, 'none' | 'plain' | 'alt' | 'head' | 'plain-flush' | 'alt-flush'> = {
  'hero-dark': 'none',
  'hero-panel': 'none',
  'section-head': 'head',
  'entity-banner': 'alt',
  telbar: 'plain-flush',
  notice: 'plain',
  'stat-bar': 'plain',
  'feature-cards': 'plain',
  'trust-grid': 'plain',
  'path-cards': 'plain',
  'service-card': 'plain',
  'device-row': 'plain',
  'doctor-card': 'plain',
  'cert-grid': 'plain',
  'env-grid': 'plain',
  'data-table': 'plain',
  'list-rows': 'plain',
  'post-list': 'plain',
  'step-timeline': 'plain',
  'term-cards': 'plain',
  'flow-chain': 'plain',
  'nap-grid': 'plain',
  'route-rows': 'plain',
  'source-grid': 'plain',
  'legal-doc': 'plain',
  'article-body': 'plain',
  'article-meta': 'plain',
  'faq-detail': 'plain',
  'faq-index': 'plain',
  'faq-list': 'plain',
  'hot-faq': 'plain',
  'related-faq': 'plain',
  'anchor-bar': 'plain',
  gallery: 'plain',
  'case-card': 'plain',
  'job-list': 'plain',
  pager: 'plain',
  'index-list': 'plain',
  'glass-card': 'plain',
  'visit-cards': 'plain',
  'vcard-grid': 'plain',
  tagline: 'plain',
  'side-news': 'plain'
}

type SectionVariant = 'none' | 'plain' | 'alt' | 'head' | 'plain-flush' | 'alt-flush'

function sectionOf(block: { key: string; section?: string }): SectionVariant {
  const hint = block.section
  if (
    hint === 'plain' ||
    hint === 'alt' ||
    hint === 'plain-flush' ||
    hint === 'alt-flush' ||
    hint === 'head' ||
    hint === 'none'
  ) {
    return hint
  }
  return SECTION_OF[block.key] || 'plain'
}

/** 构建期收集全部块组件：文件名 BlkHeroDark.vue → 键 'BlkHeroDark' */
/**
 * 相对路径必须写成 `./`：本文件就在 `components/blocks/` 目录里，
 * 写成 `../components/blocks/` 会指到 `components/components/blocks/`（不存在的目录），
 * glob 返回空表 → 全部块渲染成「缺失块」占位，且构建不报错（静默失败，最难查的那类）。
 */
const modules = import.meta.glob('./Blk*.vue')

/** 文件名 → 组件定义（异步组件，Nuxt 会自动处理 SSR 渲染） */
const registry = new Map<string, () => Promise<unknown>>()
for (const [file, loader] of Object.entries(modules)) {
  const name = file.replace(/^.*[\\/]/, '').replace(/\.vue$/, '')
  registry.set(name, loader)
}

/** 已解析出的组件（避免同一块在页面里重复解析） */
const resolved = new Map<string, unknown>()

function componentOf(key: string): unknown {
  const name = `Blk${blockKeyToPascal(key)}`
  if (resolved.has(name)) return resolved.get(name)
  const loader = registry.get(name)
  if (!loader) return null
  // Vue 对「函数式异步组件」的支持：直接把 () => import(...) 交给 <component :is>
  const asyncComponent = defineAsyncComponent(loader as () => Promise<{ default: unknown }>)
  resolved.set(name, asyncComponent)
  return asyncComponent
}

/**
 * 首屏双栏归并（ADR-036 补充）：
 *   设计稿里首页 Hero 是「左文案 + 右 372px 玻璃面板」的两栏网格（`.hero-in`），
 *   但 CMS 中 hero-dark 与 hero-panel 是两个块、序列化后是并列节点，无法共用父网格。
 *   这里在渲染清单阶段把**紧跟在 hero-dark 之后的 hero-panel** 收进 hero 块自己的
 *   `panel` 字段，由 hero-dark 负责渲染两栏——块模型不变（hero-panel 仍可独立使用），
 *   设计稿 `.hero-in` 的 grid 声明也无需改动。
 *
 * 标题与内容同节归并（ADR-036 补充）：
 *   设计稿的 `sec-head` 与它引领的网格/列表在**同一个** `<section>` 里（共享 56px
 *   留白与 `.alt` 灰底带）；CMS 中它们是两个块。这里把 section-head 与**紧跟其后的
 *   第一个内容块**合并为一个渲染单元：外层 section 的底色取**内容块**的节奏提示，
 *   head 组件与内容组件先后渲染在同一个 `.wrap` 里（原型 `sec-head` 自带 28px 下边距）。
 *   页面级编排由块实例的 `section` 提示承载（生成器在导入描述里逐页标注）。
 */
const items = computed(() => {
  const source = props.blocks || []

  /** 第一遍：hero-panel 归并进 hero-dark */
  const afterHero: typeof source = []
  for (let index = 0; index < source.length; index += 1) {
    const block = source[index]
    const next = source[index + 1]
    if (block.key === 'hero-dark' && next?.key === 'hero-panel' && next.enabled !== false) {
      afterHero.push({ ...block, data: { ...(block.data || {}), panel: next.data || {} } })
      index += 1
      continue
    }
    afterHero.push(block)
  }

  /** 第二遍：section-head 与后随内容块合成一个渲染单元 */
  type Unit = {
    id: string
    key: string
    enabled: boolean
    section: SectionVariant
    component: unknown
    data: Record<string, any>
    context: BlockContext
    /** 同节标题（section-head），与本单元共用一个 `<section>` */
    head?: { key: string; component: unknown; data: Record<string, any>; context: BlockContext }
  }

  const contextFor = (block: (typeof source)[number], data: Record<string, any>): BlockContext => ({
    ...props.context,
    block: { id: block.id, key: block.key, enabled: block.enabled !== false },
    items: (data.items as unknown[]) ?? undefined
  })

  const units: Unit[] = []
  for (let index = 0; index < afterHero.length; index += 1) {
    const block = afterHero[index]
    const next = afterHero[index + 1]

    if (block.key === 'section-head' && block.enabled !== false && next && next.enabled !== false) {
      const nextVariant = sectionOf(next)
      if (nextVariant !== 'none' && next.key !== 'section-head') {
        const data = next.data || {}
        units.push({
          id: block.id || next.id,
          key: next.key,
          enabled: true,
          section: nextVariant,
          component: componentOf(next.key),
          data,
          context: contextFor(next, data),
          head: {
            key: block.key,
            component: componentOf(block.key),
            data: block.data || {},
            context: contextFor(block, block.data || {})
          }
        })
        index += 1
        continue
      }
    }

    const data = block.data || {}
    units.push({
      id: block.id,
      key: block.key,
      enabled: block.enabled !== false,
      section: sectionOf(block),
      component: componentOf(block.key),
      data,
      context: contextFor(block, data)
    })
  }

  return units
})
</script>

<template>
  <div class="blocks">
    <template v-for="item in items" :key="item.id || item.key">
      <!-- 节奏容器（ADR-036 补充）：块自身只描述内容，section 由渲染器按清单/页面提示包裹 -->
      <section
        v-if="item.enabled && item.section !== 'none'"
        class="site-section"
        :class="{
          alt: item.section === 'alt' || item.section === 'alt-flush',
          'flush-top': item.section === 'plain-flush' || item.section === 'alt-flush',
          'site-section--head': item.section === 'head'
        }"
        :data-block-key="item.key"
      >
        <div class="wrap">
          <div v-if="item.head && !item.head.component" class="block-missing" :data-block-key="item.head.key">
            块不可用：{{ item.head.key }}（块定义已删除或代码未编译通过）
          </div>
          <component
            :is="item.head.component"
            v-else-if="item.head"
            :data="item.head.data"
            :context="item.head.context"
            :data-block-id="item.id"
          />

          <div v-if="!item.component" class="block-missing" :data-block-key="item.key">
            块不可用：{{ item.key }}（块定义已删除或代码未编译通过）
          </div>
          <component :is="item.component" v-else :data="item.data" :context="item.context" :data-block-id="item.id" />
        </div>
      </section>

      <!-- 无节奏容器：hero 自带 section / 面包屑等 -->
      <div v-else-if="item.enabled && !item.component" class="block-missing" :data-block-key="item.key">
        块不可用：{{ item.key }}（块定义已删除或代码未编译通过）
      </div>
      <component
        :is="item.component"
        v-else-if="item.enabled"
        :data="item.data"
        :context="item.context"
        :data-block-id="item.id"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
/**
 * 容器对版式**完全中性**（ADR-036）：
 *   原型把页面节奏放在每个块的 `<section>` / `<section class="alt">` 上（56px padding、
 *   bg-2 底带、上下描边），块与块之间没有额外间距。
 *   因此这里不能再用 flex + gap 给块加间隔——那会给每个块都多加 40px，
 *   并把 `.alt` 的整幅底色切成一条条不相邻的带子。
 *   渲染器只负责「按顺序排出块」，纵向节奏交给原型 CSS。
 */
.blocks {
  display: block;
}

/**
 * 缺失块只在生产环境标灰、不抛错：
 * 一个块坏掉不该让整页 500（其余内容仍可被搜索引擎抓取）
 */
.block-missing {
  padding: 16px;
  border: 1px dashed var(--geo-line, #e2e9f2);
  border-radius: 12px;
  color: var(--geo-ink-3, #7688a0);
  font-size: 13px;
}
</style>
