// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({ features: { tooling: true } })
  .append({
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      /** 与 Prettier 对齐：Prettier 对 void 元素（input / img / br 等）输出自闭合 `/>`；此处两种写法都放行，避免 lint 与 format 互相拆台 */
      'vue/html-self-closing': ['error', { html: { void: 'any', normal: 'always', component: 'always' } }]
    }
  })
  .append({
    ignores: ['.nuxt/**', '.output/**', 'dist/**']
  })
  /**
   * 颜色唯一来源约束（防止主题色散落回页面）：
   * 1. 管理后台 UI 主题色 → `app/assets/scss/tokens.scss`（页面用 SCSS 令牌或 `.c-*` 语义类）
   * 2. 站点主题默认值 → `app/config/site-defaults.ts`（唯一允许出现颜色字面量的 TS 文件）
   */
  .append({
    files: ['app/**/*.{ts,vue}'],
    ignores: ['app/config/site-defaults.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]',
          message:
            '禁止硬编码颜色：后台主题色统一在 assets/scss/tokens.scss（用 SCSS 令牌或 .c-* 语义类），站点主题默认值放 app/config/site-defaults.ts'
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: '禁止硬编码颜色：请使用 tokens.scss 的 SCSS 令牌或 .c-* 语义类'
        }
      ]
    }
  })
