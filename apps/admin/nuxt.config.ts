/**
 * 管理后台 Nuxt 4 配置
 * 要点：SPA 渲染（无 SSR）、Element Plus 全局注册、SCSS 令牌全局注入、全局 CSS 顺序（先 Element 后自定义覆盖）
 * 渲染模式：SPA，理由见 docs/spec/08-adr.md ADR-017 —— 登录态存 localStorage，服务端无法鉴权，
 * SSR 只会带来 hydration 不一致与服务端开销；后台无 SEO 需求
 */
/** 开发端口：由启动器注入的 PORT（源自 config/ports.mjs），避免与 GEO 项目争抢 Nuxt 默认 3000 */
const devPort = Number(process.env.PORT || 0)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  /** 纯客户端渲染（SPA）：页面与路由守卫全部在浏览器执行 */
  ssr: false,

  /**
   * Pinia 由官方模块接入：
   * - 模块负责创建实例（SSR 每请求独立，避免跨请求状态串台）并序列化到 payload
   * - 自动导入 `app/stores/**` 下的 store（如 `useAuthStore`），无需逐个 import
   * 注意：不要再手写 createPinia 插件，否则会出现两个实例且 store 自动导入失效
   */
  modules: ['@pinia/nuxt'],

  /**
   * 开发端口由启动器注入的 PORT 决定（源自 config/ports.mjs）；
   * host 固定 0.0.0.0：同局域网设备（手机 / 其他电脑）用本机 IP 也能打开，启动器会打印该入口（见 ADR-021）
   */
  devServer: devPort ? { port: devPort, host: '0.0.0.0' } : undefined,

  /**
   * 基础路径：管理后台整体挂在 /geocms/ 下（与 GEO 站点渲染、服务端 /geoserver 前缀区隔）
   * 路由跳转（navigateTo / NuxtLink）会自动带上该前缀；
   * 代码里对 location.pathname 做路由判断时必须先剥离前缀（见 app/config/api/http.ts 的 currentRoutePath）
   */
  app: {
    baseURL: '/geocms/'
  },

  runtimeConfig: {
    public: {
      /**
       * 服务端 API 基址：由根 env/ 提供、启动器注入（config/index.mjs 按服务端端口派生）
       * 不再内置默认地址，缺失时 app/config/api/http.ts 会给出明确报错
       */
      apiBase: process.env.NUXT_PUBLIC_API_BASE
    }
  },

  css: ['element-plus/dist/index.css', '~/assets/scss/main.scss'],

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          /** 令牌与 mixin 全局注入，页面内无需逐个 @use */
          additionalData: `@use "~/assets/scss/tokens.scss" as *;\n@use "~/assets/scss/mixins.scss" as *;`
        }
      }
    },

    /**
     * element-plus 与 dayjs 都必须走 Vite 依赖预构建：
     * 一旦 element-plus 被排除（例如放进 `build.transpile`），浏览器会直接加载其 ESM 源码，
     * 内部 `import dayjs` 会落到 CJS 的 `dayjs.min.js`，报
     * `does not provide an export named 'default'`，客户端模块图中断、hydration 失败（页面点击无响应）。
     * 因此不要给 element-plus 配 `build.transpile`。
     */
    optimizeDeps: {
      include: ['element-plus', 'dayjs']
    }
  }
})
