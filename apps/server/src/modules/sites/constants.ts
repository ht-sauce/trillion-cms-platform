/**
 * 站点模块常量：默认值集中在此，避免散落硬编码
 */
import type { RenderMode, SiteStatus, RobotsPolicy, ThemeConfig } from '@trillion/shared'

/** AI 爬虫策略默认值：默认放行全部已知 AI 爬虫（GEO 关键，切忌默认屏蔽） */
export const AI_CRAWLER_DEFAULTS: RobotsPolicy = {
  allowAllAi: true,
  blockedAgents: [],
  extraAllowedAgents: []
}

/** 站点默认值 */
export const SITE_DEFAULTS = {
  locale: 'zh-CN',
  renderMode: 'ssg' as RenderMode,
  status: 'active' as SiteStatus,
  /** 深空控制台风格默认主题令牌 */
  theme: {
    primary: '#3B82F6',
    accent: '#67E8F9',
    background: '#0B1224',
    text: '#E8EDFF',
    radius: 8
  } as ThemeConfig
}
