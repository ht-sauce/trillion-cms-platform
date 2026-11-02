<script setup lang="ts">
/**
 * 产品卡网格（地坪 / 建材类产品陈列）
 *
 * 设计口径（复刻自 Forintech 行业产品体系页）：
 *   大图卡：成品地面实拍图在上，型号 + 中文名 + 一句话适用场景在下，底部「了解更多」。
 *   与 `itemcard`（键值明细卡）的分工：那张卡讲参数，这张卡讲观感与选型入口。
 *
 * 图片口径：`img` 只接受站内 `/assets/img/**` 静态路径或素材 publicUrl；
 *   留空时渲染占位块而不是外链占位图（外链图在国内网络下会成为首屏白块）。
 *
 * 链接写法：与 cert-grid 一致，用 v-if / v-else 两套 DOM ——
 *   不用 `<component :is="'NuxtLink'">`，字符串解析在非 Nuxt 环境（后台块预览）会失败。
 */
import type { BlockContext } from '@trillion/shared'

defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'product-card',
  name: '产品卡网格',
  hint: '带成品实拍图的产品陈列卡（型号 + 名称 + 适用场景），2~3 列',
  fields: [
    {
      key: 'items',
      label: '产品',
      type: 'list',
      item: {
        type: 'group',
        fields: [
          { key: 'name', label: '产品名称', type: 'text', required: true, hint: '如 ForinCrete SL' },
          { key: 'cnName', label: '中文名', type: 'text', hint: '如 聚氨酯砂浆自流平' },
          { key: 'series', label: '系列', type: 'text', hint: '如 ForinCrete / ForinShield / ForinCoat' },
          { key: 'desc', label: '适用场景', type: 'text', hint: '一句话说明用在什么地面、解决什么问题' },
          { key: 'img', label: '实拍图', type: 'text', hint: '站内路径 /assets/img/**；留空则显示占位块' },
          { key: 'tags', label: '标签', type: 'list', item: { type: 'text' }, hint: '2~4 个，如 耐重载 / 防静电' },
          { key: 'href', label: '详情链接', type: 'url' }
        ]
      }
    },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      options: ['2', '3'],
      default: '2',
      hint: '2 列用于大图陈列，3 列用于同系列产品并排对比'
    }
  ]
})
</script>

<template>
  <div class="pgrid" :class="data.columns === '3' ? 'cols-3' : 'cols-2'">
    <template v-for="item in data.items || []" :key="item.name">
      <NuxtLink v-if="item.href" class="pcard" :to="item.href">
        <div class="pic">
          <img v-if="item.img" :src="item.img" :alt="`${item.name}${item.cnName ? ' ' + item.cnName : ''} 成品地面`" loading="lazy" />
          <span v-else class="ph">成品实拍图待补</span>
        </div>
        <div class="body">
          <span v-if="item.series" class="series">{{ item.series }}</span>
          <h4>{{ item.name }}</h4>
          <span v-if="item.cnName" class="cn">{{ item.cnName }}</span>
          <span v-if="item.desc" class="p">{{ item.desc }}</span>
          <div v-if="item.tags?.length" class="tags">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
          <span class="go">了解更多 →</span>
        </div>
      </NuxtLink>
      <div v-else class="pcard">
        <div class="pic">
          <img v-if="item.img" :src="item.img" :alt="`${item.name}${item.cnName ? ' ' + item.cnName : ''} 成品地面`" loading="lazy" />
          <span v-else class="ph">成品实拍图待补</span>
        </div>
        <div class="body">
          <span v-if="item.series" class="series">{{ item.series }}</span>
          <h4>{{ item.name }}</h4>
          <span v-if="item.cnName" class="cn">{{ item.cnName }}</span>
          <span v-if="item.desc" class="p">{{ item.desc }}</span>
          <div v-if="item.tags?.length" class="tags">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
