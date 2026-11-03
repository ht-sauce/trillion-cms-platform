<script setup lang="ts">
/**
 * 地坪构造剖面（layer stack）
 *
 * 为什么值得做成交互：地坪选型最核心的信息不是「有哪些产品」，而是「这套系统从下到上
 * 由哪几层构成、每层多厚、各解决什么问题」。文字列表读不出层序，等高色块也读不出厚度差。
 * 这里左边是可扫读的层列表，右边是按**相对厚度**画的剖面图，鼠标移到任一侧，两边同时高亮。
 *
 * 【样式自带】交互结构（双栏 + 剖面）是块自己的形态，scoped 样式不依赖 site.css（ADR-048）。
 * 【降级】无 JS 时默认高亮第一层，剖面与列表仍完整可读（内容全在 SSR 输出里）。
 */
import { computed, ref } from 'vue'

const props = defineProps<{ data: Record<string, any>; context: any }>()

/** 当前聚焦的层下标；初始聚焦第一层（面层），让首屏就有"正在看什么"的锚点 */
const active = ref(0)

const layers = computed(() => props.data.layers || [])

/** 剖面视觉比例：按各层相对厚度给高度，面层薄、基层厚（真按毫米画会看不见面层） */
const HEIGHTS = [44, 56, 26, 74, 36, 30]

defineBlock({
  key: 'layer-stack',
  name: '地坪构造剖面',
  hint: '左列层位 + 右列剖面图，联动高亮：每层的材料、厚度、作用',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '如「系统构造（自上而下）」' },
    { key: 'caption', label: '剖面图标题', type: 'text', hint: '如「SYSTEM SECTION / 剖面示意」' },
    {
      key: 'layers',
      label: '构造层',
      type: 'list',
      hint: '按「面层→基层」顺序填写，2~6 层',
      item: {
        type: 'group',
        fields: [
          { key: 'role', label: '层位', type: 'text', required: true, hint: '如 面漆 / 中涂 / 底漆 / 混凝土基层' },
          { key: 'code', label: '英文名', type: 'text', hint: '如 TOP COAT' },
          { key: 'product', label: '材料', type: 'text', hint: '如 ForinShield SL；不确定留空' },
          { key: 'thickness', label: '厚度', type: 'text', hint: '如 2~3 mm；无据可查留空' },
          { key: 'desc', label: '作用', type: 'text', hint: '这一层解决什么问题' }
        ]
      }
    },
    { key: 'note', label: '注释', type: 'textarea', hint: '如「厚度为常规做法，实际以现场勘测为准」' }
  ]
})
</script>

<template>
  <div class="stackwrap">
    <div class="ls-cols">
      <div class="ls-list">
        <div
          v-for="(layer, i) in layers"
          :key="layer.role"
          class="ls-layer"
          :class="{ on: active === i }"
          @mouseenter="active = i"
          @click="active = i"
        >
          <span class="ls-lv">L{{ i + 1 }}</span>
          <h4>
            {{ layer.role }}
            <em v-if="layer.code">{{ layer.code }}</em>
          </h4>
          <span class="ls-th">{{ layer.thickness || '' }}</span>
          <p class="ls-desc">{{ layer.desc }}</p>
          <p v-if="layer.product" class="ls-prod">材料：{{ layer.product }}</p>
        </div>
      </div>

      <aside class="ls-view">
        <div class="ls-cap">{{ data.caption || 'SYSTEM SECTION / 剖面示意' }}</div>
        <div class="ls-strata">
          <div
            v-for="(layer, i) in layers"
            :key="`s-${layer.role}`"
            class="ls-stratum"
            :class="[`tone-${i}`, { on: active === i }]"
            :style="{ height: `${HEIGHTS[i] || 40}px` }"
            @mouseenter="active = i"
            @click="active = i"
          >
            <span class="nm">{{ layer.role }}</span>
            <span class="ls-th">{{ layer.thickness || '' }}</span>
          </div>
        </div>
        <p v-if="data.note" class="ls-note">{{ data.note }}</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ls-cols {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: clamp(28px, 5vw, 72px);
  align-items: start;
}
.ls-list {
  border-top: 1px solid rgba(11, 13, 16, 0.12);
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-list {
  border-top-color: rgba(255, 255, 255, 0.1);
}
.ls-layer {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 24px 20px;
  border-bottom: 1px solid rgba(11, 13, 16, 0.1);
  cursor: pointer;
  position: relative;
  transition: background 0.3s, padding-left 0.3s;
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
.ls-layer::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: background 0.3s;
}
.ls-layer.on {
  background: rgba(11, 13, 16, 0.04);
  padding-left: 26px;
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer.on {
  background: rgba(255, 255, 255, 0.04);
}
.ls-layer.on::before {
  background: var(--teal);
}
.ls-layer .ls-lv {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  color: #9aa0a6;
  letter-spacing: 0.1em;
}
.ls-layer h4 {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
}
.ls-layer h4 em {
  font-style: normal;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 600;
  color: #6a7178;
  background: rgba(11, 13, 16, 0.06);
  padding: 2px 8px;
  border-radius: 3px;
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer h4 em {
  background: rgba(255, 255, 255, 0.08);
  color: #8a9099;
}
.ls-layer .ls-th {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12.5px;
  color: #3a3f45;
  text-align: right;
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer .ls-th {
  color: rgba(255, 255, 255, 0.55);
}
.ls-layer .ls-desc,
.ls-layer .ls-prod {
  grid-column: 2 / -1;
  font-size: 13px;
  color: #6a7178;
  line-height: 1.75;
  margin: 0;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s, margin 0.3s;
}
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer .ls-desc,
:global(.site-section:not(.alt):not(.alt-flush)) .ls-layer .ls-prod {
  color: #8a9099;
}
.ls-layer.on .ls-desc {
  max-height: 80px;
  opacity: 1;
  margin-top: 8px;
}
.ls-layer.on .ls-prod {
  max-height: 40px;
  opacity: 1;
  margin-top: 4px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11.5px;
}

/* 剖面图 */
.ls-view {
  border: 1px solid rgba(11, 13, 16, 0.12);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  position: sticky;
  top: 88px;
}
.ls-view .ls-cap {
  padding: 13px 18px;
  border-bottom: 1px solid rgba(11, 13, 16, 0.1);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: #6a7178;
}
.ls-strata {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 18px;
}
.ls-stratum {
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 11.5px;
  font-weight: 600;
  transition: transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.35s;
  cursor: pointer;
}
.ls-stratum .ls-th {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px;
  opacity: 0.72;
}
.ls-stratum.on {
  transform: translateX(6px);
  box-shadow: -4px 0 0 var(--ink, #0b0d10);
}
.ls-stratum.tone-0 {
  background: var(--teal);
  color: var(--on-brand, #3a2a00);
}
.ls-stratum.tone-1 {
  background: #c57f00;
  color: #fff;
}
.ls-stratum.tone-2 {
  background: #7a6a50;
  color: #fff;
}
.ls-stratum.tone-3 {
  background: #d8d5cf;
  color: #3a3f45;
}
.ls-stratum.tone-4 {
  background: #b9b4ab;
  color: #3a3f45;
}
.ls-stratum.tone-5 {
  background: #9a948a;
  color: #fff;
}
.ls-view .ls-note {
  margin: 0;
  padding: 0 18px 18px;
  font-size: 11.5px;
  line-height: 1.8;
  color: #6a7178;
}
@media (max-width: 980px) {
  .ls-cols {
    grid-template-columns: 1fr;
  }
  .ls-view {
    position: static;
  }
}
</style>
