<script setup lang="ts">
import { useMenuStore } from '~/stores/menu'
import { firstMenuPath } from '~/utils/menu-tree'

const menuStore = useMenuStore()
const route = useRoute()
const targetPath = computed(() => (menuStore.loaded ? firstMenuPath(menuStore.tree) : ''))

watch(
  targetPath,
  (path) => {
    if (path && route.path === '/') navigateTo(path, { replace: true })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page-wrap">
    <el-empty v-if="menuStore.loaded && !targetPath" description="暂无可用菜单，请联系管理员授权" />
  </div>
</template>
