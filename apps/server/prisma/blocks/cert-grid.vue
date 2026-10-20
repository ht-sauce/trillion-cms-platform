<script setup lang="ts">
/**
 * 资质卡网格（原型 `.certgrid` + `.certcard`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 99-blocks.html `blk-certcard / certgrid`：
 *   .certgrid > a.certcard > (span.cv > img  |  span.cv.pdf > b + small)
 *                          + span.lb + b + span.no + span.st
 *
 * 数据字段：cols / items[{label, holder, no, img, href}]
 * 设计稿硬约束：PDF 类证件（如营业执照）走 `.cv.pdf` 占位样式，不做假图。
 *
 * 【2026-10-14 需求】去掉「查看原件 →」按钮（span.st 不再渲染）；
 * 卡片仅在填写了核验链接（href）时才渲染为链接，否则为纯展示 div
 * （当前数据 href 全为空，原先 to="#" 点击会跳页顶）。
 */
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 依据扩展名判定是否为 PDF（原型用 .cv.pdf 占位） */
function isPdf(img?: string): boolean {
  return typeof img === 'string' && img.toLowerCase().endsWith('.pdf')
}

defineBlock({
  key: 'cert-grid',
  name: '资质卡网格',
  hint: '证件缩略图 + 类别 + 编号（可选核验链接）',
  fields: [
    { key: 'cols', label: '列数', type: 'select', options: ['2', '3', '4'], default: '3' },
    {
      key: 'items',
      label: '证件',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'label', label: '证件类别', type: 'text' },
          { key: 'holder', label: '持证主体 / 事项', type: 'text' },
          { key: 'no', label: '编号', type: 'text' },
          {
            key: 'img',
            label: '证件图片 / 文件',
            type: 'text',
            hint: '填图片路径显示缩略图；填 PDF 路径则显示文件卡片'
          },
          { key: 'href', label: '核验链接', type: 'url' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="certgrid" :style="{ gridTemplateColumns: `repeat(${props.data.cols || 3},1fr)` }">
    <template v-for="cert in props.data.items || []" :key="cert.label">
      <NuxtLink v-if="cert.href" class="certcard" :to="cert.href">
        <span v-if="isPdf(cert.img)" class="cv pdf"><b>PDF</b><small>原件</small></span>
        <span v-else class="cv">
          <img v-if="cert.img" :src="cert.img" :alt="cert.label" loading="lazy" />
        </span>
        <span class="lb">{{ cert.label }}</span>
        <b>{{ cert.holder }}</b>
        <span v-if="cert.no" class="no">{{ cert.no }}</span>
      </NuxtLink>
      <div v-else class="certcard">
        <span v-if="isPdf(cert.img)" class="cv pdf"><b>PDF</b><small>原件</small></span>
        <span v-else class="cv">
          <img v-if="cert.img" :src="cert.img" :alt="cert.label" loading="lazy" />
        </span>
        <span class="lb">{{ cert.label }}</span>
        <b>{{ cert.holder }}</b>
        <span v-if="cert.no" class="no">{{ cert.no }}</span>
      </div>
    </template>
  </div>
</template>
