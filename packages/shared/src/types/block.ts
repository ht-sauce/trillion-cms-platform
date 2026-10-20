/** Block 类型清单（决定 admin 表单形态与 GEO 项目渲染组件） */
export const BLOCK_TYPES = ['hero', 'text', 'faq', 'imageList', 'contact'] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/** 每种 Block 的中文名与 GEO 说明，管理后台表单使用 */
export const BLOCK_META: Record<BlockType, { label: string; hint: string }> = {
  hero: { label: '首屏 Banner', hint: '站点/页面主视觉与行动号召' },
  text: { label: '图文段落', hint: '结构化标题 + 段落，可被 AI 直接引用' },
  faq: { label: 'FAQ 问答', hint: '自动生成 FAQPage 结构化数据，GEO 效果最佳' },
  imageList: { label: '图片列表', hint: '多图展示，alt 文本影响 GEO' },
  contact: { label: '联系信息', hint: '本地化信号，含企业名称与备案信息' }
}
