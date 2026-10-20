<script setup lang="ts">
/**
 * 百度地图纯展示块（HC-14 v3.2 / G2，ADR-008 无密钥上线）
 *
 * 【1:1 还原口径 · ADR-036】直接使用原型类名 + DOM，样式由 geo-site-bridge.css
 * 追加段承担（.bmap-live/.bmap-open/.bmap-chip，源：站点/assets/css/xr-common.css）。
 *
 * 原型 DOM（站点/index.html、visit、contact 三页同一结构）：
 *   .bmap-live > img(百度真实瓦片静态图) + a.bmap-open[target=_blank] > span.bmap-chip
 *
 * 零 JS、零第三方：页内是一张静态瓦片 <img>（本就不可拖动缩放），整图覆盖透明
 * <a target="_blank"> 新开百度地图定位。
 *
 * 地图口径（用户裁定 A 方案，2026-10-12，ADR-008 覆盖 ADR-004）：
 * - ak 一律留空，使用百度 staticimage **v1 无密钥**接口（当日实测 HTTP 200 出图）；
 * - 仅当 ak 有值时才切 v2（保留日后能力，不需改代码）；
 * - 坐标 BD-09（108.9932,34.2829，长缨西路·建秦苑/胡家庙西侧），全站一个 POI。
 */
import { computed } from 'vue'
import type { BlockContext } from '@trillion/shared'

const props = defineProps<{ data: Record<string, any>; context: BlockContext }>()

defineBlock({
  key: 'bmap-live',
  name: '百度地图',
  hint: '展示医院位置的静态地图图片；点击整张地图会在新窗口打开百度地图查看导航',
  fields: [
    {
      key: 'title',
      label: '机构名称',
      type: 'text',
      required: true,
      hint: '地图定位点的名称，如「西安新城仁爱皮肤病医院」'
    },
    {
      key: 'address',
      label: '详细地址',
      type: 'text',
      required: true,
      hint: '点击地图跳转后，在百度地图里展示给患者的地址'
    },
    { key: 'lng', label: '经度', type: 'text', required: true, hint: '百度地图坐标（BD-09），如 108.9932' },
    {
      key: 'lat',
      label: '纬度',
      type: 'text',
      required: true,
      hint: '百度地图坐标（BD-09），如 34.2829；百度地图网页版右键目标位置可复制坐标'
    },
    { key: 'zoom', label: '缩放级别', type: 'number', default: 16, hint: '数字越大地图越细，一般填 14~18' },
    { key: 'width', label: '地图宽度（像素）', type: 'number', default: 1200 },
    { key: 'height', label: '地图高度（像素）', type: 'number', default: 420 },
    { key: 'chip', label: '按钮文字', type: 'text', default: '在百度地图中打开 ↗' },
    {
      key: 'ak',
      label: '百度地图密钥（一般留空）',
      type: 'text',
      hint: '留空即可正常使用；只有医院自行申请了密钥才需要填写'
    }
  ]
})

const staticUrl = computed(() => {
  const { lng, lat, zoom = 16, width = 1200, height = 420, ak } = props.data
  if (ak) {
    // v2 需 ak，保留能力，当前不使用
    const markerStyles = '-1,' + encodeURIComponent('https://api.map.baidu.com/images/markers.png')
    return (
      `https://api.map.baidu.com/staticimage/v2?ak=${encodeURIComponent(ak)}` +
      `&center=${lng},${lat}&width=${width}&height=${height}&zoom=${zoom}` +
      `&markers=${lng},${lat}&markerStyles=${markerStyles}`
    )
  }
  // v1 无密钥（A 方案定稿）
  return (
    `https://api.map.baidu.com/staticimage?center=${lng},${lat}&zoom=${zoom}` +
    `&width=${width}&height=${height}&markers=${lng},${lat}`
  )
})

const openUrl = computed(() => {
  const { lat, lng, title, address } = props.data
  const t = encodeURIComponent(title || '')
  const c = encodeURIComponent(address || '')
  return `https://map.baidu.com/?latlng=${lat},${lng}&title=${t}&content=${c}&autoOpen=true&l=`
})
</script>

<template>
  <div class="bmap-live">
    <img
      :src="staticUrl"
      :width="data.width || 1200"
      :height="data.height || 420"
      loading="lazy"
      :alt="`百度地图 · ${data.title}定位（${data.address}）`"
    />
    <a
      class="bmap-open"
      :href="openUrl"
      target="_blank"
      rel="noopener"
      :aria-label="`在百度地图中打开${data.title}定位（新标签页）`"
    >
      <span class="bmap-chip">{{ data.chip || '在百度地图中打开 ↗' }}</span>
    </a>
  </div>
</template>
