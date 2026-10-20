<script setup lang="ts">
/**
 * 根路径占位页：直接访问 / 时内容区保持空白
 * 原根路径仪表盘「GEO 监控工作台」完整保留在 app/components/DashboardOverview.vue，
 * 只是本页不挂载它（2026-10-14）；需要恢复展示时在模板中写 <DashboardOverview /> 即可
 */
</script>

<template>
  <div class="page-wrap" />
</template>
