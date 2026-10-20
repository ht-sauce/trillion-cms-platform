<script setup lang="ts">
/**
 * 侧栏菜单节点（递归组件，支持最多三级）
 * 叶子节点直接导航；目录型菜单点击展开/收起，子树命中当前路由时给出高亮提示
 */
import type { MenuNode } from '~/config/api'

const props = defineProps<{
  item: MenuNode
  /** 当前路由路径，用于高亮 */
  current: string
  /** 层级，从 1 开始，决定缩进 */
  depth: number
}>()

/** 展开状态：默认展开，便于直接定位当前页 */
const open = ref(true)

const hasChildren = computed(() => props.item.children.length > 0)
const isLink = computed(() => !hasChildren.value && Boolean(props.item.path))
const active = computed(() => Boolean(props.item.path) && props.item.path === props.current)
const branchActive = computed(() => contains(props.item, props.current))
const indent = computed(() => ({ paddingLeft: `${(props.depth - 1) * 12 + 12}px` }))

/** 子树中是否包含指定路径 */
function contains(node: MenuNode, path: string): boolean {
  if (!path) return false
  return node.children.some((child) => child.path === path || contains(child, path))
}
</script>

<template>
  <NuxtLink v-if="isLink" :to="item.path || '/'" class="item" :class="{ active }" :style="indent">
    {{ item.title }}
  </NuxtLink>

  <button v-else type="button" class="item dir" :class="{ branch: branchActive }" :style="indent" @click="open = !open">
    <span class="txt">{{ item.title }}</span>
    <span class="caret" :class="{ open }">›</span>
  </button>

  <div v-if="hasChildren && open" class="children">
    <SideMenuNode v-for="child in item.children" :key="child.id" :item="child" :current="current" :depth="depth + 1" />
  </div>
</template>

<style scoped lang="scss">
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $sp-1;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  border-radius: $radius-md;
  background: transparent;
  color: $c-text-sub;
  font-family: inherit;
  font-size: $font-size-sm;
  text-align: left;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    background: $c-elevated;
    color: $c-text;
  }

  &.active {
    background: $c-elevated;
    color: $c-primary;
    box-shadow: inset 2px 0 0 $c-primary;
  }

  &.branch {
    color: $c-text;
  }
}

.caret {
  font-size: 10px;
  color: $c-text-faint;
  transition: transform 0.15s;

  &.open {
    transform: rotate(90deg);
  }
}

.children {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
