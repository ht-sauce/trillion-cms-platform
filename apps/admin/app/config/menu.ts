/**
 * 字典与标签映射（配置化字段统一放 config）
 * 注意：
 * 1. 侧栏菜单**不再在此硬编码**——由后台菜单配置驱动（menu 表 / `/geoserver/menus/tree`），
 *    见 `~/stores/menu.ts` 与 `~/components/SideMenuNode.vue`
 * 2. 角色名称**不再在此硬编码**——/geoserver/auth/me 会随用户返回 roleName（角色表数据）
 */

/** 渲染模式标签 */
export const RENDER_MODE_LABEL: Record<string, string> = {
  ssg: 'SSG 静态',
  ssr: 'SSR 动态'
}

/**
 * 内容状态标签（含三态流）
 * 颜色只给**语义类名**（定义在 `assets/scss/main.scss`），TS 里不允许出现色值
 */
export const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'c-mute' },
  pending_review: { label: '待审核', className: 'c-warning' },
  published: { label: '已发布', className: 'c-success' }
}

/**
 * 内容树页面徽标（由产物清单派生，见 09 §8.2）
 * 颜色只给 Element Plus 的语义 type，TS 里不允许出现色值
 */
export const BADGE_META: Record<string, { label: string; type: 'success' | 'warning' | 'danger' | 'info' }> = {
  published: { label: '已发布', type: 'success' },
  pending: { label: '待发布', type: 'warning' },
  missing: { label: '产物缺失', type: 'danger' },
  draft: { label: '草稿', type: 'info' }
}

/**
 * 导航分组键与标题（服务端 `apps/server/src/modules/navigation` 与 shared 的 NAVIGATION_KEYS 对齐）
 * 头部主导航 + 页脚四列，共 5 组；后台导航管理页按此顺序渲染页签
 */
export const NAVIGATION_TABS: { key: string; title: string }[] = [
  { key: 'header', title: '头部主导航' },
  { key: 'footer-1', title: '页脚第一列' },
  { key: 'footer-2', title: '页脚第二列' },
  { key: 'footer-3', title: '页脚第三列' },
  { key: 'footer-4', title: '页脚第四列' }
]

/**
 * 块归属标签（09 §4.5）
 * public = 公共模板（模板库，站点首次引用时才复制一份初始代码到本站）
 * site   = 本站块（本站独有，改代码只影响本站）
 */
export const BLOCK_SCOPE_LABEL: Record<string, string> = {
  public: '公共模板',
  site: '本站块'
}

/**
 * 构建状态字典（**唯一口径**，三处共用）
 *   1) 站点管理列表「构建状态」列（`SiteItem.build`）
 *   2) 内容编辑器工具条状态 + 构建按钮锁定（`ArtifactSummary.task`）
 *   3) 总览「最近发布任务」表格（`PublishTask.status`）
 * `idle` = 从未构建过（没有任务记录）；颜色只给语义类名，TS 里不允许出现色值
 */
export const BUILD_STATUS_META: Record<string, { label: string; className: string }> = {
  idle: { label: '未构建', className: 'c-mute' },
  pending: { label: '排队中', className: 'c-warning' },
  running: { label: '构建中', className: 'c-primary' },
  success: { label: '构建成功', className: 'c-success' },
  failed: { label: '构建失败', className: 'c-danger' }
}
