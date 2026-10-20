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
    // sites/ 是 SSG 构建产物目录，不参与 lint
    ignores: ['.nuxt/**', '.output/**', 'dist/**', 'sites/**']
  })
