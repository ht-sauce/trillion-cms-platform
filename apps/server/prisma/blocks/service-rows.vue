<script setup lang="ts">
/**
 * 服务三栏（service rows）
 *
 * 与 `feature-cards` 的分工：卡片网格是「几个并列的小块信息」，本块是**部门的服务承诺**——
 * 编号 + 标题 + 一段说明，无卡片边框，靠竖分隔线与留白分栏。
 * 视觉上更接近工程公司的"业务范围"页，而不是产品功能格子。
 *
 * 【样式自带】分栏与竖线属于块形态，scoped 样式，不依赖 site.css（ADR-048）。
 */
defineProps<{ data: Record<string, any>; context: any }>()

defineBlock({
  key: 'service-rows',
  name: '服务三栏',
  hint: '编号 + 标题 + 说明的三栏服务介绍（无卡片边框，竖线分栏）',
  fields: [
    {
      key: 'items',
      label: '条目',
      type: 'list',
      hint: '2~4 条',
      item: {
        type: 'group',
        fields: [
          { key: 'no', label: '编号', type: 'text', hint: '如 01；留空自动按顺序编号' },
          { key: 'title', label: '标题', type: 'text', required: true },
          { key: 'desc', label: '说明', type: 'textarea', hint: '2~3 句，讲清这一项做什么、解决什么' },
          { key: 'moreLabel', label: '链接文案', type: 'text', hint: '如「四大系列」' },
          { key: 'href', label: '链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="srows">
    <div v-for="(item, i) in data.items || []" :key="item.title" class="srow">
      <span class="no">{{ item.no || String(i + 1).padStart(2, '0') }}</span>
      <h3>{{ item.title }}</h3>
      <p v-if="item.desc">{{ item.desc }}</p>
      <a v-if="item.href" class="go" :href="item.href"> {{ item.moreLabel || '了解更多' }} <i>→</i> </a>
    </div>
  </div>
</template>

<style scoped>
.srows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
:global(.site-section.alt) .srows,
:global(.site-section.alt-flush) .srows {
  border-top-color: rgba(11, 13, 16, 0.12);
}
.srow {
  padding: 34px 32px 40px 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}
:global(.site-section.alt) .srow,
:global(.site-section.alt-flush) .srow {
  border-right-color: rgba(11, 13, 16, 0.12);
}
.srow:last-child {
  border-right: 0;
}
.no {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  color: var(--teal);
  letter-spacing: 0.14em;
  display: block;
  margin-bottom: 24px;
}
h3 {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0 0 12px;
  color: inherit;
}
p {
  font-size: 13.5px;
  line-height: 1.85;
  color: #8a9099;
  margin: 0;
}
:global(.site-section.alt) p,
:global(.site-section.alt-flush) p {
  color: #5f666f;
}
.go {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--teal);
  text-decoration: none;
}
.go i {
  font-style: normal;
  transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.go:hover i {
  transform: translateX(4px);
}
@media (max-width: 860px) {
  .srow {
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 0;
  }
  .srow:last-child {
    border-bottom: 0;
  }
}
</style>
