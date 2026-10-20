/**
 * 新闻/问答详情页的标准块组合常量
 *
 * 新闻与问答以「Page + 块数据」形态存在（kind=detail 的详情页），
 * 本模块新建/重建详情页块数组时，notice / telbar / hero-dark 的固定文案与动作
 * 从站点现有详情页（如 xian-renai-skin 的 /news/*、/faq/q*）1:1 复制，
 * 保证管理端新建的内容与建站导入的既有页面块组合完全一致。
 */

/** hero-dark 固定说明文案（列表页与详情页共用） */
export const HERO_NOTE = '门诊时间 8:30-17:30，午间不休息，周末及法定节假日正常接诊'

/** hero-dark 固定动作按钮 */
export const HERO_ACTIONS = [
  { href: 'tel:029-82531111', label: '预约热线 029-82531111', primary: true },
  { href: '/contact', label: '来院路线', primary: false }
]

/**
 * 合规声明 notice 文案（新闻详情页由 article-body.disclaimer 承担，无独立 notice 块；
 * 问答详情页第二条 notice 使用）。新闻详情页曾同时输出 disclaimer 与 notice 两条相同
 * 文案，2026-10-15 去重后仅保留正文块自带的 disclaimer（发布前置必填）。
 */
export const NOTICE_COMPLIANCE = {
  text: '**合规声明：**本条内容为项目客观信息登记，仅用于医学科普与信息参考，不构成诊疗建议，不含疗效承诺。价格为院内公示价，与公示一致。',
  variant: 'info'
}

/** 回答口径说明 notice（问答详情页第一条） */
export const NOTICE_FAQ_CALIBER = {
  text: '**回答口径说明：**以上答案依据机构统一对外口径整理，涉及费用、医保、预约规则的具体数值以到院实际公示为准。',
  variant: 'info'
}

/** 新闻域 telbar（新闻列表页与新闻详情页共用） */
export const TELBAR_NEWS = {
  title: '初诊建议提前电话预约，到院直接取号',
  desc: '门诊时间 8:30-17:30，午间不休息，周末及法定节假日正常接诊。地址 西安市新城区长缨西路408-1-5号。如需核实本栏目任一条信息，可在就诊时向工作人员索取原始材料。',
  actions: [{ href: 'tel:029-82531111', label: '预约热线 029-82531111', primary: true }]
}

/** 问答域 telbar（问答列表页与问答详情页共用） */
export const TELBAR_FAQ = {
  title: '初诊建议提前电话预约，到院直接取号',
  desc: '门诊时间 8:30-17:30，午间不休息，周末及法定节假日正常接诊。地址 西安市新城区长缨西路408-1-5号。问题中没有覆盖到的，可电话咨询或到院面询。',
  actions: [{ href: 'tel:029-82531111', label: '预约热线 029-82531111', primary: true }]
}

/** 问答详情页「相关内容」section-head 固定文案 */
export const FAQ_DETAIL_RELATED_HEAD = { title: '相关内容', desc: '以下为同分类的其他问题。' }
