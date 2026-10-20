<script setup lang="ts">
/**
 * 专有名词说明：渲染「名词 + ?」，hover / 聚焦问号弹出一段解释
 *
 * 文案一律取自 `~/config/glossary.ts`（唯一事实来源）。问号的样式与弹层排版**只在这里和
 * `assets/scss/main.scss` 的 `.term-tooltip` 定义**：页面里不要再自己拼 `el-tooltip + .term-mark`，
 * 否则各页各写一份，弹层宽度会忽宽忽窄（长文案被拉成横贯屏幕的一行，读到一半要左右追字）。
 * 统一后：弹层宽度 150–300px、行高 1.6、自动换行，长短文案读起来一致。
 *
 * 用法：
 *   表单标签 `<template #label><TermHint term="urlSlug" /></template>`
 *   表格表头 `<template #header><TermHint term="blockKey" /></template>`
 *   正文内联 `<TermHint term="draft" />`
 *   按钮内（按钮已显示名词，只要问号）`<TermHint term="geoIndexUpdate" :show-label="false" />`
 */
import { TERMS, type TermKey } from '~/config/glossary'

const props = withDefaults(
  defineProps<{
    /** 名词 key（见 config/glossary.ts） */
    term: TermKey
    /** 是否连名词一起渲染；调用方已自行显示名词时传 false，只出问号 */
    showLabel?: boolean
    /** 弹层方向；页面顶部工具条（上方空间不足）传 bottom，其余默认 top */
    placement?: 'top' | 'bottom'
  }>(),
  { showLabel: true, placement: 'top' }
)
</script>

<template>
  <span class="term-hint">
    <template v-if="props.showLabel">{{ TERMS[props.term].label }}</template>
    <el-tooltip
      :placement="props.placement"
      :content="TERMS[props.term].hint"
      :show-after="120"
      popper-class="term-tooltip"
    >
      <!-- 问号可能落在按钮里：拦住冒泡，避免"想看说明"变成"点了按钮" -->
      <span class="term-mark" role="img" :aria-label="TERMS[props.term].hint" tabindex="0" @click.stop>?</span>
    </el-tooltip>
  </span>
</template>
