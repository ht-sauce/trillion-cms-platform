<script setup lang="ts">
/**
 * 场景首屏（industry scene hero）
 *
 * 与 `hero-dark` 的分工：hero-dark 是「一张底图 + 一段导语」的通用首屏；
 * 本块把**四类工况装进同一个首屏**——右侧竖排行业索引，切换即换整屏场景图。
 * 工业地坪的选型逻辑本来就是「先看场景」，首屏直接把这个逻辑做成交互，比轮播图有信息量。
 *
 * 【样式自带】本块内联 scoped 样式，不依赖 site.css（ADR-048）：
 *   交互结构（全屏网格 + 覆盖层 + 索引列）是块自己的形态，塞进站点样式表会让块无法复用。
 *
 * 【SEO / GEO】所有场景图都在 SSR 输出的 HTML 里，切换只靠 class 控制显隐，
 *   不靠 JS 插入节点——爬虫拿到的是全部场景，而不是首屏那一屏。
 */
import { computed, ref } from 'vue'

const props = defineProps<{ data: Record<string, any>; context: any }>()

/**
 * 当前场景下标。点击或悬停索引即切换整屏背景图。
 * 用 v-show 语义的 class 切换而不是 v-if：所有场景图都在 SSR 里输出，爬虫与首屏都能拿到。
 */
const active = ref(0)
function pick(i: number) {
  active.value = i
}

/** 标题：`\n` 换行，高亮词包 `<em>`（先转义再注入受控标记） */
const titleHtml = computed(() => {
  const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let out = esc(props.data.h1)
  const mark = esc(props.data.h1Grad || '')
  if (mark && out.includes(mark)) out = out.replace(mark, `<em>${mark}</em>`)
  return out.replace(/\n/g, '<br />')
})

defineBlock({
  key: 'scene-hero',
  name: '场景首屏',
  hint: '全屏实景首屏 + 右侧行业索引：悬停或点击切换场景图，底部带数据条',
  fields: [
    { key: 'eyebrow', label: '顶部标签', type: 'text', hint: '如「INDUSTRIAL FLOORING · SINCE 2001」' },
    { key: 'h1', label: '主标题', type: 'text', required: true, hint: '全页唯一 H1；换行用 \\n' },
    { key: 'h1Grad', label: '高亮词', type: 'text', hint: '主标题里需要品牌色强调的词' },
    { key: 'lead', label: '导语', type: 'textarea', required: true, hint: '60~120 字，自包含' },
    {
      key: 'scenes',
      label: '场景',
      type: 'list',
      hint: '2~4 个；每个场景一张实景图',
      item: {
        type: 'group',
        fields: [
          { key: 'name', label: '场景名', type: 'text', required: true, hint: '如 食品饮料' },
          { key: 'img', label: '场景图', type: 'text', required: true, hint: '站内路径 /assets/img/**' },
          { key: 'alt', label: '图片说明', type: 'text' }
        ]
      }
    },
    {
      key: 'actions',
      label: '行动按钮',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '文案', type: 'text' },
          { key: 'href', label: '链接', type: 'url' },
          { key: 'primary', label: '主按钮', type: 'switch' }
        ]
      }
    },
    {
      key: 'stats',
      label: '数据条',
      type: 'list',
      hint: '3~4 项，显示在首屏底部',
      item: {
        type: 'group',
        fields: [
          { key: 'n', label: '数值', type: 'text' },
          { key: 'unit', label: '单位', type: 'text' },
          { key: 'label', label: '指标名', type: 'text' }
        ]
      }
    }
  ]
})
</script>

<template>
  <section class="sh-scene-hero">
    <div class="sh-bg">
      <div
        v-for="(scene, i) in data.scenes || []"
        :key="scene.name"
        class="sh-shot"
        :class="{ on: active === i }"
        :data-scene="i"
      >
        <img :src="scene.img" :alt="scene.alt || `${scene.name}场景地坪`" loading="eager" />
      </div>
    </div>

    <div class="wrap sh-inner">
      <div class="sh-lead-col">
        <div v-if="data.eyebrow" class="sh-eyebrow">{{ data.eyebrow }}</div>
        <h1 v-html="titleHtml"></h1>
        <p class="sh-lead">{{ data.lead }}</p>
        <div class="sh-acts">
          <template v-for="action in data.actions || []" :key="action.label">
            <a v-if="action.href" :href="action.href" class="sh-btn" :class="action.primary ? 'primary' : 'ghost'">
              {{ action.label }}
            </a>
            <span v-else class="sh-btn" :class="action.primary ? 'primary' : 'ghost'">{{ action.label }}</span>
          </template>
        </div>
      </div>

      <div v-if="(data.scenes || []).length" class="sh-scenes">
        <button
          v-for="(scene, i) in data.scenes"
          :key="scene.name"
          type="button"
          class="sh-scene"
          :class="{ on: active === i }"
          :data-scene="i"
          :aria-label="`查看${scene.name}场景`"
          @click="pick(i)"
          @mouseenter="pick(i)"
        >
          <span class="sh-num">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="sh-nm">{{ scene.name }}</span>
          <span class="sh-bar"></span>
        </button>
      </div>
    </div>

    <div v-if="(data.stats || []).length" class="sh-statsbar">
      <div class="wrap sh-stats-grid">
        <div v-for="stat in data.stats" :key="stat.label" class="sh-stat">
          <b>{{ stat.n }}<small v-if="stat.unit">{{ stat.unit }}</small></b>
          <span>{{ stat.label }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sh-scene-hero {
  position: relative;
  min-height: min(100svh, 860px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  background: #000;
}
.sh-bg {
  position: absolute;
  inset: 0;
}
.sh-shot {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.9s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sh-shot.on {
  opacity: 1;
}
.sh-shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.06);
  transition: transform 1.8s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sh-shot.on img {
  transform: scale(1);
}
.sh-bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(6, 8, 10, 0.94) 0%, rgba(6, 8, 10, 0.72) 38%, rgba(6, 8, 10, 0.26) 68%, rgba(6, 8, 10, 0.58) 100%),
    linear-gradient(180deg, rgba(6, 8, 10, 0.5) 0%, transparent 28%, rgba(6, 8, 10, 0.78) 100%);
}
.wrap {
  position: relative;
  z-index: 2;
  width: min(1280px, 92vw);
  margin: 0 auto;
}
.sh-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 48px;
  flex: 1;
  padding: 56px 0 96px;
}
.sh-lead-col {
  max-width: 720px;
}
.sh-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.24em;
  color: var(--teal);
  text-transform: uppercase;
  margin-bottom: 24px;
}
.sh-eyebrow::before {
  content: "";
  width: 26px;
  height: 1px;
  background: var(--teal);
}
h1 {
  font-size: clamp(36px, 5.2vw, 72px);
  line-height: 1.08;
  letter-spacing: -0.03em;
  font-weight: 800;
  color: #fff;
  margin: 0;
}
h1 :deep(em) {
  font-style: normal;
  color: var(--teal);
}
.sh-lead {
  margin-top: 24px;
  max-width: 46ch;
  font-size: 15px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.74);
}
.sh-acts {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  flex-wrap: wrap;
}
.sh-btn {
  display: inline-flex;
  align-items: center;
  padding: 14px 26px;
  border-radius: 3px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
  transition: all 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sh-btn.primary {
  background: var(--teal);
  color: #0b0d10;
}
.sh-btn.primary:hover {
  background: #ffc24b;
  transform: translateY(-2px);
}
.sh-btn.ghost {
  border-color: rgba(255, 255, 255, 0.28);
  color: #fff;
}
.sh-btn.ghost:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.06);
}
.sh-scenes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: right;
  flex: 0 0 auto;
}
.sh-scene {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 11px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  background: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.25s;
}
.sh-scene .sh-num {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  opacity: 0.7;
}
.sh-scene .sh-bar {
  flex: 0 0 auto;
  width: 0;
  height: 1.5px;
  background: var(--teal);
  transition: width 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sh-scene.on {
  color: #fff;
}
.sh-scene.on .sh-bar {
  width: 26px;
}
.sh-scene:hover {
  color: rgba(255, 255, 255, 0.9);
}
.sh-statsbar {
  position: relative;
  z-index: 2;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, transparent, rgba(6, 8, 10, 0.5));
}
.sh-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}
.sh-stat {
  padding: 22px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}
.sh-stat:last-child {
  border-right: 0;
}
.sh-stat b {
  display: block;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
}
.sh-stat b small {
  font-size: 12px;
  color: var(--teal);
  margin-left: 3px;
}
.sh-stat span {
  font-size: 11.5px;
  color: #8a9099;
  letter-spacing: 0.04em;
}
@media (max-width: 820px) {
  .sh-scenes,
  .sh-statsbar {
    display: none;
  }
  .sh-inner {
    padding-bottom: 64px;
  }
}
</style>
