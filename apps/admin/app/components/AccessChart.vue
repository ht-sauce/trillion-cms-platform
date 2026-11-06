<script setup lang="ts">
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ option: EChartsCoreOption; label: string }>()
const emit = defineEmits<{ select: [index: number, seriesIndex: number] }>()
const container = ref<HTMLDivElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined

function render() {
  if (!chart || !container.value) return
  const style = getComputedStyle(container.value)
  const css = (key: string) => style.getPropertyValue(key).trim()
  chart.setOption(
    {
      color: ['--chart-browser', '--chart-search', '--chart-ai', '--chart-unknown'].map(css),
      textStyle: {
        color: css('--chart-text'),
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize)
      },
      ...props.option
    },
    { notMerge: true }
  )
}

watch(() => props.option, render, { deep: true })
onMounted(() => {
  if (!container.value) return
  chart = init(container.value)
  chart.on('click', (event) => {
    if (
      event.componentType === 'series' &&
      typeof event.dataIndex === 'number' &&
      typeof event.seriesIndex === 'number'
    )
      emit('select', event.dataIndex, event.seriesIndex)
  })
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(container.value)
  render()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div ref="container" class="access-chart" role="img" :aria-label="label" />
</template>

<style scoped lang="scss">
.access-chart {
  --chart-browser: #{$c-primary};
  --chart-search: #{$c-success};
  --chart-ai: #{$c-accent};
  --chart-unknown: #{$c-text-mute};
  --chart-text: #{$c-text-sub};
  width: 100%;
  height: calc($sp-4 * 8);
  min-width: 0;
}
</style>
