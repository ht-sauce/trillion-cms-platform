<script setup lang="ts">
/**
 * 地坪构造分层（从面层到基层的剖面示意）
 *
 * 为什么单独做一块：地坪选型的核心信息不是「有哪些产品」，而是「这套系统从下到上
 * 由哪几层构成、每层多厚、各用什么材料」。这类信息在原站以示意图呈现，文字版
 * （`data-table`）读不出层序，所以用分层条表达：自上而下 = 面漆 → 中涂 → 底漆 → 基面。
 *
 * 层的顺序即数组顺序（**面层在前**），与施工顺序相反——按剖面图的阅读习惯排列，
 * 页面文案需要解释时在 `note` 里写明「由上至下为使用面到结构基层」。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'system-stack',
  name: '地坪构造层',
  hint: '面层→基层的分层剖面：每层材料、厚度、作用',
  fields: [
    { key: 'title', label: '标题', type: 'text', hint: '如 系统构造（自上而下）' },
    {
      key: 'layers',
      label: '构造层',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'role', label: '层位', type: 'text', required: true, hint: '如 面漆 / 中涂 / 底漆 / 混凝土基面' },
          { key: 'product', label: '材料', type: 'text', hint: '如 ForinShield SL（面漆）' },
          { key: 'thickness', label: '厚度', type: 'text', hint: '如 2~3mm；不确定就留空，不要估' },
          { key: 'desc', label: '作用', type: 'text', hint: '如 提供耐磨面层与防滑纹理' }
        ]
      }
    },
    { key: 'note', label: '注释', type: 'textarea', hint: '如「厚度为常规做法，实际以现场勘测与设计选型为准」' }
  ]
})
</script>

<template>
  <div class="stackwrap">
    <div v-if="data.title" class="stack-title">{{ data.title }}</div>
    <div class="stack">
      <div v-for="(layer, index) in data.layers || []" :key="index" class="layer" :class="`lv-${index + 1}`">
        <span class="no">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="role">{{ layer.role }}</span>
        <span class="pd">{{ layer.product }}</span>
        <span v-if="layer.thickness" class="th">{{ layer.thickness }}</span>
        <span v-if="layer.desc" class="ds">{{ layer.desc }}</span>
      </div>
    </div>
    <p v-if="data.note" class="stack-note">{{ data.note }}</p>
  </div>
</template>
