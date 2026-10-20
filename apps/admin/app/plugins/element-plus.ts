/**
 * Element Plus 注册插件
 * 不依赖第三方集成模块（避免版本兼容问题），直接注册完整组件库 + 亮色主题变量覆盖
 *
 * size: 'small' 是**全局尺寸基准**：后台密度规范（12px 字号、紧凑控件、密集表格）
 * 与 Element Plus 的 small 档一一对应，组件无需再逐个写 size="small"
 */
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(ElementPlus, { locale: zhCn, size: 'small' })
})
