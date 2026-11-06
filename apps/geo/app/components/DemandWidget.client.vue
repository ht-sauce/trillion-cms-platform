<script setup lang="ts">
import { mountDemand } from '~/utils/demand'

const config = useRuntimeConfig()
const { context, resolve } = useSiteContext()
const error = ref('')

onMounted(async () => {
  try {
    const base = new URL(String(config.public.apiBase))
    const apiBase = import.meta.dev ? new URL(base.pathname, window.location.origin).href : base.href
    await resolve()
    const developmentSite = import.meta.dev && context.value.prefix ? context.value.key : undefined
    await mountDemand(apiBase.replace(/\/$/, ''), developmentSite)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '需求组件加载失败'
  }
})
</script>

<template>
  <p v-if="error" role="status">需求咨询暂不可用：{{ error }}</p>
</template>
