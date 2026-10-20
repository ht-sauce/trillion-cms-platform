<script setup lang="ts">
/**
 * 设备行卡组（原型 `.dev-row` 列表）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 site.css 承担。
 *
 * 原型 DOM 对应 09-devices.html / 99-blocks.html `blk-dev-row`：
 *   .dev-row > (div.pic > img) + div > (h4 + div.meta > span* + p + div.use > b)
 *   左图右文 200px 栅格；注册证号等宽字体（原型 .dev-row .meta span 自带 mono）。
 *
 * 一个块 = 一组设备行（原型一个 section 里纵向排多行设备，行间 12px 间距）。
 *
 * 设计稿硬约束：设备型号与注册证编号必须与院内实际一致，不做疗效表述。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'device-row',
  name: '设备行卡组',
  hint: '一组设备行：左图右文，型号 / 注册证号 / 说明 / 用途',
  fields: [
    {
      key: 'items',
      label: '设备行',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'cat', label: '设备分类', type: 'text', hint: '如「检测设备」' },
          {
            key: 'img',
            label: '设备图片',
            type: 'text',
            hint: '图片路径，如 /assets/img/device/xxx.jpg（从素材库复制）'
          },
          { key: 'name', label: '设备名称', type: 'text', required: true },
          { key: 'model', label: '规格型号', type: 'text' },
          { key: 'cert', label: '注册证编号', type: 'text' },
          { key: 'desc', label: '说明', type: 'textarea' },
          { key: 'use', label: '用途', type: 'textarea' },
          { key: 'price', label: '价格', type: 'text' }
        ]
      }
    }
  ]
})
</script>

<template>
  <div class="device-rows">
    <div v-for="item in data.items || []" :key="item.name" class="dev-row">
      <div v-if="item.img" class="pic">
        <img :src="item.img" :alt="item.name" loading="lazy" />
      </div>
      <div>
        <h4>{{ item.name }}</h4>
        <div v-if="item.model || item.cert" class="meta">
          <span v-if="item.model">{{ item.model }}</span>
          <span v-if="item.cert">{{ item.cert }}</span>
        </div>
        <p v-if="item.desc">{{ item.desc }}</p>
        <div v-if="item.use" class="use"><b>用途：</b>{{ item.use }}</div>
      </div>
    </div>
  </div>
</template>

<style>
/* 原型 09-devices.html 里多行设备同处一个 section，行间距 12px（设计稿段落式排布） */
.device-rows {
  display: grid;
  gap: 12px;
}
</style>
