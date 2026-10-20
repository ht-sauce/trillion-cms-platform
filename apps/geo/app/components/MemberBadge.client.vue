<script setup lang="ts">
/**
 * 会员入口（客户端动态 island）
 * SSG 静态站点无法持有会话，会员相关功能全部由浏览器端调用服务端 member API 完成；
 * 公开内容必须在 SSG 阶段直出 HTML，不得依赖本组件的客户端渲染
 */
import { ref, onMounted } from 'vue'
import { useApiBase } from '../utils/api-base'
import { useSiteContext } from '../composables/useSiteKey'

const apiBase = useApiBase()
/** 站点标识：与页面渲染同一套解析规则（本地回环地址靠 URL 站点前缀定位站点） */
const { context, resolve } = useSiteContext()

const token = ref('')
const user = ref<{ username: string; nickname: string | null } | null>(null)
const form = ref({ username: '', password: '' })
const showPanel = ref(false)

onMounted(async () => {
  token.value = localStorage.getItem('member_token') || ''
  if (!token.value) return
  const result = await $fetch<{ code: number; data: { valid: boolean; username?: string; nickname?: string } }>(
    `${apiBase}/site-auth/me`,
    { headers: { Authorization: `Bearer ${token.value}` } }
  )
  user.value = result.data?.valid ? { username: result.data.username!, nickname: result.data.nickname ?? null } : null
})

async function login() {
  await resolve()
  const site = await $fetch<{ code: number; data: { id: string } }>(`${apiBase}/public/site/${context.value.key}`)
  const result = await $fetch<{ code: number; data: { token: string } }>(`${apiBase}/site-auth/login`, {
    method: 'POST',
    body: { siteId: site.data.id, username: form.value.username, password: form.value.password }
  })
  token.value = result.data.token
  localStorage.setItem('member_token', token.value)
  showPanel.value = false
}

function logout() {
  token.value = ''
  user.value = null
  localStorage.removeItem('member_token')
}
</script>

<template>
  <div class="member">
    <span v-if="user" class="who">{{ user.nickname || user.username }}</span>
    <button v-else class="btn" @click="showPanel = !showPanel">会员登录</button>

    <form v-if="showPanel" class="panel" @submit.prevent="login">
      <label class="sr-only" for="member-username">会员账号</label>
      <input id="member-username" v-model="form.username" type="text" placeholder="账号" autocomplete="username" />
      <label class="sr-only" for="member-password">会员密码</label>
      <input
        id="member-password"
        v-model="form.password"
        type="password"
        placeholder="密码"
        autocomplete="current-password"
      />
      <button class="btn primary" type="submit">登录</button>
    </form>
    <button v-if="user" class="btn" @click="logout">退出</button>
  </div>
</template>

<style scoped lang="scss">
.member {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--geo-text);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.primary {
  background: var(--geo-primary);
  border-color: var(--geo-primary);
}

.panel {
  position: absolute;
  top: 32px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(11, 18, 36, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  z-index: 10;

  input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 4px;
    padding: 6px 8px;
    color: var(--geo-text);
    font-size: 12px;
  }
}

.who {
  font-size: 12px;
  color: var(--geo-accent);
}

/** 视觉隐藏但保留给读屏器的标签 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
