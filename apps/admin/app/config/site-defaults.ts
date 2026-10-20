/**
 * 站点默认值（新建站点表单的初始数据）
 *
 * 说明：
 * 1. 这里的色值是**站点主题数据默认值**（GEO 站点外观，存 `Site.themeConfig`），
 *    不是管理后台 UI 主题；后台 UI 的颜色唯一来源是 `assets/scss/tokens.scss`
 * 2. 必须与服务端 `apps/server/src/modules/sites/constants.ts` 的 `SITE_DEFAULTS.theme` 保持一致
 *    （服务端在创建站点时也以此为兜底值）
 * 3. 本文件是全项目**唯一允许出现颜色字面量**的 TS 文件（ESLint 规则已豁免）
 */
export interface SiteThemeConfig {
  primary: string
  accent: string
  background: string
  text: string
  radius: number
}

export const DEFAULT_SITE_THEME: SiteThemeConfig = {
  primary: '#3B82F6',
  accent: '#67E8F9',
  background: '#0B1224',
  text: '#E8EDFF',
  radius: 8
}
