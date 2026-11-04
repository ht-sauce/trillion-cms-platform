/**
 * 页面主标题来源判定（H1 归谁）
 *
 * 背景（2026-11-04）：
 *   布局层 `PageRender` 在页面没有首屏块时会补一条通用页头（H1 = page.title + 摘要），
 *   而问答详情页（`/faq/*`）的块序列是 `section-head` + `article-body` + `faq-list`，
 *   其 section-head 的标题本身就是这条问答的问题——两边各渲染一次，页面上同一个问题就出现了两次
 *   （小号页头 + 大号区块标题），答案也跟着重复显示。
 *
 * 因此 H1 的归属必须**只有一个判定点**，三个消费方共用本文件：
 *   1) `PageRender`：是否还要补通用页头（只在 fallback 时补）
 *   2) `BlockRenderer`：给「担任页面主标题」的那个 section-head 注入 `context.pageTitle`
 *   3) `section-head` 块：按 `context.pageTitle` 决定渲染 h1 还是 h2
 *
 * 规则：
 *   - 页面存在首屏块（hero-dark / scene-hero / hero-panel）→ 由首屏块提供 H1
 *   - 否则若**第一个启用块**是 section-head → 由它提供 H1（问答 / 产品类无首屏的详情页）
 *   - 其余情况 → 布局层兜底页头
 */
import type { BlockInstance } from '@trillion/shared'

/** 承载 H1 的首屏块（hero-panel 通常被归并进 hero-dark，独立使用时同样算首屏） */
const HERO_BLOCKS = ['hero-dark', 'scene-hero', 'hero-panel']

export type TitleSource = 'hero' | 'section-head' | 'fallback'

/** 判定页面主标题来源，返回来源类型与担任主标题的块 id（fallback 时为 null） */
export function resolveTitleSource(blocks: BlockInstance[] | undefined): {
  source: TitleSource
  blockId: string | null
} {
  const enabled = (blocks || []).filter((block) => block.enabled !== false)

  if (enabled.some((block) => HERO_BLOCKS.includes(block.key))) {
    return { source: 'hero', blockId: null }
  }

  const first = enabled[0]
  if (first && first.key === 'section-head') {
    return { source: 'section-head', blockId: first.id ?? null }
  }

  return { source: 'fallback', blockId: null }
}
