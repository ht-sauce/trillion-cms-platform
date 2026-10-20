/**
 * 登录状态 store：token 持久化 + 当前用户信息 + 角色相关派生数据
 */
import { navigateTo } from '#app'
import { defineStore } from 'pinia'
import { authApi, clearToken, getToken, setToken, type AdminUser } from '~/config/api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    user: null as AdminUser | null,
    loading: false
  }),
  getters: {
    isLogin: (state) => Boolean(state.token),
    /** 是否平台级角色（由「用户 → 角色」绑定的角色 platform 标记决定） */
    isPlatformAdmin: (state) => Boolean(state.user?.platform)
  },
  actions: {
    init() {
      this.token = getToken()
    },
    async login(username: string, password: string) {
      this.loading = true
      try {
        const result = await authApi.login(username, password)
        this.token = result.token
        this.user = result.user
        setToken(result.token)
        return true
      } finally {
        this.loading = false
      }
    },
    async loadUser() {
      if (!this.token) return
      this.user = await authApi.me()
    },
    logout() {
      this.token = ''
      this.user = null
      clearToken()
      navigateTo('/login')
    }
  }
})
