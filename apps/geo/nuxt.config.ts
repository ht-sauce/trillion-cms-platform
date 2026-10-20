/**
 * GEO 项目（站点渲染引擎）Nuxt 4 配置
 * 双模式：SSG 由构建脚本「SSR 爬取」输出到 sites/<slug>/；SSR 运行时按 Host 解析站点实时渲染
 * 环境变量：NUXT_PUBLIC_SITE_SLUG（构建目标站点）、NUXT_BUILD_OUTPUT（产物目录）
 *
 * ⚠️ 构建期不做 prerender：页面 HTML 一律由 scripts/build-sites.mjs 拉起缓存渲染服务爬取产出（ADR-032）。
 * 原因见下方 nitro.prerender 注释（prerender 会把页面路径烘焙成构建期静态文件表，短路 SSR 并使缓存路径 500）。
 */
import { stripDefineBlockCall } from '@trillion/shared'

/** 开发端口：由启动器注入的 PORT（源自 config/ports.mjs），避免与管理后台争抢 Nuxt 默认 3000 */
const devPort = Number(process.env.PORT || 0)

/** 匹配「组件目录」与「块目录」的路径片段（Windows 用反斜杠，故两种分隔符都要认） */
const COMPONENT_PATH_PATTERN = '[\\\\/]components[\\\\/]'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  devtools: { enabled: false },

  /**
   * 开发端口由启动器注入的 PORT 决定（源自 config/ports.mjs）；
   * host 固定 0.0.0.0：同局域网设备（手机 / 其他电脑）用本机 IP 也能打开站点，启动器会打印该入口（见 ADR-021）
   */
  devServer: devPort ? { port: devPort, host: '0.0.0.0' } : undefined,

  /**
   * 组件自动导入：关闭目录名作为前缀
   * 原因：`components/blocks/BlockRenderer.vue` 默认会被注册为 `<BlocksBlockRenderer>`，
   * 与 `PageRender.vue` 中的 `<BlockRenderer />` / Block 分发器内的 `<BlockHero />` 写法不匹配，
   * 导致整个 Block 渲染链路解析失败（页面只剩标题、正文区块全部缺失）
   */
  components: [{ path: '~/components', pathPrefix: false }],

  /**
   * 埋点插件为**构建期条件注册**（默认关闭）：`NUXT_PUBLIC_TRACK_ENABLED=1` 才打包进产物，
   * 默认构建里完全没有埋点代码（不放 plugins/ 自动扫描目录就是为了能整体排除）。
   */
  plugins: process.env.NUXT_PUBLIC_TRACK_ENABLED === '1' ? ['~/analytics/analytics'] : [],

  runtimeConfig: {
    public: {
      /**
       * 服务端 API 基址：由根 env/ 提供、启动器注入（config/index.mjs 按服务端端口派生）
       * 不再内置默认地址，缺失时 app/utils/api-base.ts 会给出明确报错
       */
      apiBase: process.env.NUXT_PUBLIC_API_BASE,
      /** 构建期目标站点标识（SSG 使用） */
      siteSlug: process.env.NUXT_PUBLIC_SITE_SLUG || ''
    }
  },

  vite: {
    plugins: [
      /**
       * 块代码里的 `defineBlock({...})` 是**声明标记**，不是运行时函数：
       * 它在浏览器与 SSR 环境里都没有定义，直接执行会抛 ReferenceError。
       * 这里在编译前把它原地替换为空表达式——既去掉运行时依赖，
       * 又保持行列结构不变（编译报错的行号仍与后台看到的源码一致）。
       *
       * 声明的抽取与校验在服务端 `apps/server/src/modules/blocks/sfc.ts` 完成，
       * 两端共用 `@trillion/shared` 的 `stripDefineBlockCall`，语义不会漂移。
       */
      {
        name: 'trillion-strip-define-block',
        enforce: 'pre',
        transform(code: string, id: string) {
          if (!id.includes('components')) return null
          if (!new RegExp(`${COMPONENT_PATH_PATTERN}blocks[\\\\/]`).test(id)) return null
          if (!code.includes('defineBlock')) return null
          return { code: stripDefineBlockCall(code), map: null }
        }
      }
    ]
  },

  nitro: {
    output: {
      /**
       * 客户端资源目录（构建脚本设为 sites/.<slug>.gen 中间目录，合并后随产物发布）
       * 缺省用 dist，避免直接执行 nuxt build/generate 时误清理已发布站点目录 sites/
       */
      publicDir: process.env.NUXT_BUILD_OUTPUT || 'dist'
    },
    /**
     * 构建期不预渲染任何路由：页面 HTML 全部由 scripts/build-sites.mjs 拉起渲染服务
     * 「SSR 爬取」产出（ADR-032），此处预渲染会同时踩两个坑：
     *   1. 短路 SSR——页面路径被烘焙进 server bundle 的静态资产表（页面 → 构建期 HTML 文件），
     *      爬取请求命中该表后直接吐构建期旧 HTML，内容更新不生效；
     *   2. 缓存路径 500——缓存渲染服务复用时 .gen 是空的（爬取前清空），
     *      资产表命中却读不到文件，nitro 静态 handler 直接抛 ENOENT → 500 且响应不结束，
     *      爬取只能等超时重试（实测表现为构建"卡住无反馈"）。
     */
    prerender: {
      crawlLinks: false,
      routes: []
    }
  }
})
