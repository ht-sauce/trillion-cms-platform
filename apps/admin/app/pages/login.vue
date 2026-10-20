<script setup lang="ts">
/**
 * 登录页（亮色主题）
 */
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const auth = useAuthStore()
const form = ref({ username: '', password: '' })
const error = ref('')

async function onSubmit() {
  error.value = ''
  try {
    /** 登录成功落 token 与用户信息后进站点列表（根路径是空白占位页，不作为落点） */
    await auth.login(form.value.username, form.value.password)
    await navigateTo('/sites')
  } catch (e: unknown) {
    error.value = (e as Error).message || '登录失败'
  }
}

onMounted(() => auth.init())
</script>

<template>
  <div class="login">
    <div class="card">
      <div class="brand">
        <span class="logo" />
        <span class="title">NEXUS · CMS 控制台</span>
      </div>

      <h1 class="hello">欢迎回来</h1>
      <p class="desc">多站点内容运营平台</p>

      <form @submit.prevent="onSubmit">
        <label class="lab">账号</label>
        <input v-model="form.username" class="inp" placeholder="请输入账号" />

        <label class="lab">密码</label>
        <input v-model="form.password" type="password" class="inp" placeholder="请输入密码" />

        <p v-if="error" class="err">{{ error }}</p>

        <button type="submit" class="btn" :disabled="auth.loading">
          {{ auth.loading ? '登录中…' : '登 录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $c-bg;
}

.card {
  width: 320px;
  background: $c-panel;
  border: 1px solid $c-border;
  border-radius: $radius-xl;
  padding: $sp-3;
}

.brand {
  display: flex;
  align-items: center;
  gap: $sp-1;
  margin-bottom: $sp-4;

  .logo {
    width: 24px;
    height: 24px;
    border-radius: $radius-md;
    background: $c-primary;
  }

  .title {
    font-size: $font-size-md;
    font-weight: 500;
    color: $c-text;
  }
}

.hello {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: $c-text;
}

.desc {
  margin: 4px 0 $sp-3;
  font-size: $font-size-xs;
  color: $c-text-mute;
}

.lab {
  display: block;
  font-size: $font-size-xs;
  color: $c-text-mute;
  margin-bottom: 4px;
}

.inp {
  width: 100%;
  box-sizing: border-box;
  background: $c-input;
  border: 1px solid $c-border;
  border-radius: $radius-md;
  padding: $sp-1;
  color: $c-text;
  font-size: $font-size-sm;
  outline: none;
  margin-bottom: $sp-2;

  &:focus {
    border-color: $c-primary;
  }
}

.btn {
  width: 100%;
  margin-top: $sp-2;
  background: $c-primary;
  color: $c-on-primary;
  border: 0;
  border-radius: $radius-md;
  padding: 10px;
  font-size: $font-size-sm;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.err {
  color: $c-danger;
  font-size: $font-size-xs;
  margin: 4px 0 0;
}
</style>
