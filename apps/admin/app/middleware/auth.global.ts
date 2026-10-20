/**
 * 全局路由守卫：未登录跳转登录页
 *
 * 渲染模式为 SPA（见 docs/spec/08-adr.md ADR-017），守卫只在浏览器执行；
 * token 存 localStorage，前端守卫只负责体验，真正的安全边界是服务端接口的 JWT 守卫。
 */
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  auth.init()
  if (!auth.isLogin && to.path !== '/login') {
    return navigateTo('/login')
  }
})
