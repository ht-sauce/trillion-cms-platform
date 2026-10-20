/**
 * 站点主题令牌 → CSS 变量（09 §7.4）
 *
 * 为什么站点外观要用「令牌」而不是后台主题：
 *   站点是给外部访客看的，配色属于站点自己的品牌资产；管理后台的 Element Plus 主题是内部工具配色。
 *   两者混用会导致「后台换了个主色，线上 200 个页面全变色」——这是必须切断的耦合。
 *
 * 令牌缺省值来自设计稿 `assets/theme-b.css`；站点未配置任何令牌时即使用该套外观。
 * 块与页面**只允许使用这些变量**，写死色值属违规（后台块库会标记）。
 *
 * ⚠️ 2026-10-08 勘误：`bg` 此前为 `#F5F8FC`，与设计稿不符（设计稿 `--bg:#FFFFFF`，
 *   `#F5F8FC` 是 `--bg-2` 次级底色），导致整站底色偏灰。现已按设计稿更正（09 §7.4）。
 */
import type { SiteThemeTokens } from '@trillion/shared'

/** 设计稿默认令牌（首版医院站点的视觉基线） */
export const DEFAULT_THEME_TOKENS: SiteThemeTokens = {
  teal: '#2DD4BF',
  tealDk: '#0E9F8E',
  deep: '#0A1628',
  deep2: '#0F2A46',
  blue: '#3B82F6',
  ink: '#0D1B2A',
  ink2: '#41556E',
  ink3: '#7688A0',
  line: '#E2E9F2',
  bg: '#FFFFFF',
  ok: '#0E7C66',
  amber: '#C2410C',
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 18,
  wrap: 1180
}

/** 令牌键 → CSS 变量名（kebab-case） */
const VAR_NAMES: Record<keyof SiteThemeTokens, string> = {
  teal: '--teal',
  tealDk: '--teal-dk',
  deep: '--deep',
  deep2: '--deep-2',
  blue: '--blue',
  ink: '--ink',
  ink2: '--ink-2',
  ink3: '--ink-3',
  line: '--line',
  bg: '--bg',
  ok: '--ok',
  amber: '--amber',
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
  wrap: '--wrap'
}

/**
 * 设计稿派生变量（09 §7.4 ②）与短名别名（09 §7.4 ③）
 *
 * 为什么不做成站点可配令牌：
 *   这些值在设计稿里是常量、不随站点品牌变化；原型 CSS 与 41 个块组件都直接引用它们，
 *   必须在 `:root` 上保证有值，否则原型样式静默失效（如 `.tcard{border-radius:var(--r-md)}` 变成 0）。
 *   短名别名 `--r-sm/md/lg` 指回受管令牌 `--radius-sm/md/lg`，让原型 CSS **零改动**落地（ADR-036）。
 */
export const DERIVED_THEME_CSS = [
  '--deep-3:#163857',
  '--teal-lt:#E6FBF8',
  '--line-2:#EDF2F8',
  '--bg-2:#F5F8FC',
  '--card:#FFFFFF',
  '--warn:#B45309',
  '--shadow:0 12px 34px rgba(13,27,42,.10)',
  '--r-sm:var(--radius-sm)',
  '--r-md:var(--radius-md)',
  '--r-lg:var(--radius-lg)'
].join(';')

/**
 * 生成 CSS 变量对象（供 `:style` 绑定）
 * 站点令牌按「键存在才覆盖」合并到默认值上，缺失的令牌不会把外观打回黑底
 */
export function themeStyle(tokens?: Partial<SiteThemeTokens> | null): Record<string, string> {
  const merged = { ...DEFAULT_THEME_TOKENS, ...(tokens || {}) }
  const style: Record<string, string> = {}
  for (const [key, name] of Object.entries(VAR_NAMES)) {
    const value = merged[key as keyof SiteThemeTokens]
    if (value === undefined || value === null) continue
    style[name] = ['radiusSm', 'radiusMd', 'radiusLg', 'wrap'].includes(key) ? `${value}px` : String(value)
  }
  return style
}

/** 生成 `<style>` 文本（注入 :root，用于预览态时避免内联样式覆盖不到子组件） */
export function themeRootCss(tokens?: Partial<SiteThemeTokens> | null): string {
  const entries = Object.entries(themeStyle(tokens))
  if (!entries.length) return ''
  return `:root{${entries.map(([name, value]) => `${name}:${value}`).join(';')}}`
}

/**
 * 派生变量 + 短名别名的 `:root` 文本（09 §7.4 ② ③）
 * 必须在 `themeRootCss` **之前**注入，使站点可配令牌能覆盖同名别名来源。
 */
export function themeDerivedCss(): string {
  return `:root{${DERIVED_THEME_CSS}}`
}
