<script setup lang="ts">
/**
 * 控制台布局：左侧动态菜单 + 顶栏 + 内容区
 * 菜单由后台配置（menu 表）驱动，服务端按角色过滤，最多三级；后端 Guard 才是真正的安全边界
 */
import { clearToken } from '~/config/api'
import { useAuthStore } from '~/stores/auth'
import { useMenuStore } from '~/stores/menu'

const auth = useAuthStore()
const menuStore = useMenuStore()
const route = useRoute()

const userLabel = computed(() => auth.user?.displayName || auth.user?.username || '未登录')
const roleLabel = computed(() => auth.user?.roleName || '')
/** 顶栏面包屑：优先取菜单标题，未配置的路径回退为路径本身 */
const crumb = computed(() => menuStore.titleOf(route.path) || (route.path === '/' ? '总览仪表盘' : route.path))

onMounted(async () => {
  auth.init()
  if (!auth.isLogin) return
  try {
    if (!auth.user) await auth.loadUser()
    await menuStore.load()
  } catch {
    // 鉴权失败由 http 层统一处理（清 token 并跳转登录页），这里不重复提示
  }
})

function onCommand(command: string) {
  if (command === 'logout') {
    clearToken()
    menuStore.reset()
    auth.logout()
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sider">
      <div class="brand">
        <span class="logo" />
        <span class="name">CMS 控制台</span>
      </div>
      <nav class="menu">
        <SideMenuNode v-for="item in menuStore.tree" :key="item.id" :item="item" :current="route.path" :depth="1" />
        <p v-if="!menuStore.tree.length" class="menu-empty">暂无可用菜单</p>
      </nav>
      <div class="version">v1.0.0</div>
    </aside>

    <section class="main">
      <header class="topbar">
        <span class="crumb">{{ crumb }}</span>
        <span class="spacer" />
        <span class="sys">系统运行正常 · AI 引擎监听中</span>
        <el-dropdown trigger="click" @command="onCommand">
          <span class="user">
            <span class="avatar">{{ userLabel.slice(0, 1) }}</span>
            <span class="uname">{{ userLabel }}</span>
            <span class="urole">{{ roleLabel }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <main class="content">
        <slot />
      </main>
    </section>
  </div>
</template>

<style scoped lang="scss">
.shell {
  display: flex;
  height: 100vh;
  background: $c-bg;
}

.sider {
  width: 168px;
  flex-shrink: 0;
  background: $c-panel;
  border-right: 1px solid $c-border;
  display: flex;
  flex-direction: column;
  padding: $sp-1;
  gap: $sp-1;
}

.brand {
  display: flex;
  align-items: center;
  gap: $sp-1;
  padding: 0 4px;

  .logo {
    width: 20px;
    height: 20px;
    border-radius: $radius-sm;
    background: $c-primary;
    display: inline-block;
  }

  .name {
    font-size: $font-size-md;
    font-weight: 500;
    color: $c-text;
  }
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .menu-empty {
    margin: 0;
    padding: 6px 12px;
    color: $c-text-faint;
    font-size: $font-size-xs;
  }
}

.version {
  margin-top: auto;
  color: $c-text-faint;
  font-size: $font-size-xs;
  padding: 0 4px;
}

.main {
  flex: 1;
  min-width: 0;
  /**
   * min-height: 0 + overflow: hidden 是关键：
   * flex 子项默认 min-height: auto，内容超高时会把容器撑开、退化成"整页滚动"；
   * 这里锁死高度，让滚动发生在 .content 内部（一屏内滚动，见 AGENTS.md 页面规范）
   */
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: $sp-1;
  padding: 0 $sp-1;
  background: $c-panel;
  border-bottom: 1px solid $c-border;

  .crumb {
    font-size: $font-size-sm;
    color: $c-text;
  }

  .spacer {
    flex: 1;
  }

  .sys {
    font-size: $font-size-xs;
    color: $c-text-faint;
  }
}

.user {
  display: flex;
  align-items: center;
  gap: $sp-1;
  cursor: pointer;

  .avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: $c-elevated;
    color: $c-text;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: $font-size-xs;
  }

  .uname {
    font-size: $font-size-sm;
    color: $c-text-sub;
  }

  .urole {
    font-size: $font-size-xs;
    color: $c-text-faint;
  }
}

/** 页面主功能区：一屏内滚动（内容溢出时滚动条出现在这里，而不是浏览器） */
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: $sp-1;
}
</style>
