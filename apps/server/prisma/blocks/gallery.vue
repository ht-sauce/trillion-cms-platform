<script setup lang="ts">
/**
 * 图片网格 / 视频图集（原型 `.gal` / `.gal.c2`）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 theme-b.css 承担。
 *
 * 原型 DOM（theme-b.css `.gal`）：
 *   .gal(.c2) > figure* > (div.ph-img > (img | span.play + span.hint) + span.tag + span.dur + figcaption > small)
 *
 * 设计稿硬约束（09 §7.2 ⑤）：
 * 1. 图片必须有文字说明，裸图不出站；
 * 2. `caption` / `location` / `takenAt` / `imageNo` **四项都有值才渲染该图**，
 *    缺任一视为不可追溯，宁可不展示；
 * 3. duration / chapters 为视频专用（时长与章节时间戳），图文时可留空。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

/** 只渲染四项溯源字段齐全的图片 */
const visibleItems = computed(() => {
  const items: any[] = props.data.items || []
  return items.filter((item) => item?.caption && item?.location && item?.takenAt && item?.imageNo)
})

defineBlock({
  key: 'gallery',
  name: '图片网格',
  hint: '照片 / 视频图集；每张图需填齐「图说、拍摄地点、拍摄日期、图片编号」才会显示，保证内容可追溯',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '会作为这组图集的大标题显示' },
    { key: 'variant', label: '列数', type: 'select', options: ['3', '2'], default: '3' },
    {
      key: 'items',
      label: '图片',
      type: 'list',
      hint: '图说、拍摄地点、拍摄日期、图片编号四项都填好，这张图才会显示',
      item: {
        type: 'group',
        fields: [
          { key: 'image', label: '图片 URL', type: 'text' },
          { key: 'caption', label: '图说', type: 'text', required: true, hint: '必须有文字' },
          { key: 'location', label: '拍摄区域 / 楼层', type: 'text', required: true },
          { key: 'takenAt', label: '拍摄日期', type: 'text', required: true, hint: 'YYYY-MM-DD，过期需更新' },
          { key: 'imageNo', label: '图片编号', type: 'text', required: true, hint: '可追溯编号' },
          { key: 'duration', label: '时长', type: 'text', hint: '视频专用' },
          { key: 'chapters', label: '章节时间戳', type: 'list', item: { type: 'text' }, hint: '视频专用' }
        ]
      }
    }
  ]
})
</script>

<template>
  <h2 v-if="data.title" class="gal-title">{{ data.title }}</h2>
  <div v-if="visibleItems.length" class="gal" :class="{ c2: data.variant === '2' }">
    <figure v-for="(item, index) in visibleItems" :key="index">
      <div class="ph-img">
        <img v-if="item.image" :src="item.image" :alt="item.caption" loading="lazy" />
        <template v-else>
          <span class="play">▶</span>
          <span class="hint">{{ item.caption }}</span>
        </template>
        <span v-if="item.duration" class="dur">{{ item.duration }}</span>
      </div>
      <figcaption>
        {{ item.caption }}
        <small>{{ item.location }} · {{ item.takenAt }} · {{ item.imageNo }}</small>
        <small v-if="item.chapters?.length">{{ item.chapters.join('　') }}</small>
      </figcaption>
    </figure>
  </div>
</template>

<style>
/* 原型图集标题通常在 .sec-head 里；这里补一处独立标题的最小间距 */
.gal-title {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 16px;
}

.gal + .gal-title {
  margin-top: 28px;
}
</style>
