/**
 * 产品体系 / 成功案例接口（catalog 模块）
 * 两类内容以独立数据表为管理源（ProductIndustry + Product / CaseStudy）：
 * 列表 / 详情直接读表，增删改都按表记录 id 寻址；pageId 为发布产物页面 id（可空，仅供展示关联）
 * 保存后由服务端自动派生详情页、重算列表页并触发站点构建
 * 列表接口不返回详情字段，编辑回显走各单条详情接口（productDetail / caseDetail）
 */
import { get, post, patch, del, type Paged } from './http'
import type { ArticleBlock } from './news-faq'

/** 行业分组（/products 列表页的分组维度） */
export interface ProductIndustryItem {
  id: string
  /** 分组名称（站点内唯一，同时是产品的行业归属键） */
  name: string
  /** 分组介绍文案（section-head.desc） */
  desc: string
  /** 分组头更多链接文案（可空） */
  moreLabel?: string | null
  sort: number
  /** 组内产品数（后台展示，用于判断能否删除分组） */
  productCount: number
}

/** 产品列表项 */
export interface ProductItem {
  id: string
  pageId?: string | null
  /** 详情页访问路径 */
  path: string
  name: string
  cnName: string
  /** 树脂系列（第二种分类维度） */
  series: string
  /** 所属行业分组名清单 */
  industries: string[]
  tags: string[]
  img: string
  desc: string
  sort: number
  status: string
}

/** 产品详情（含结构化详情字段，编辑回显用） */
export interface ProductDetail extends ProductItem {
  slug: string
  lead: string
  chips: string[]
  bgImage: string
  systemIntro: { k: string; v: string }[]
  layers: Record<string, unknown>[]
  features: Record<string, unknown>[]
  colors: Record<string, unknown>[]
  faqs: { q: string; a: string }[]
}

/** 产品保存载荷（detail 字段均可空；空数组 = 详情页不含对应区块） */
export interface ProductPayload {
  name: string
  cnName?: string
  series?: string
  industries?: string[]
  desc?: string
  img?: string
  lead?: string
  chips?: string[]
  bgImage?: string
  tags?: string[]
  systemIntro?: { k: string; v: string }[]
  layers?: Record<string, unknown>[]
  features?: Record<string, unknown>[]
  colors?: Record<string, unknown>[]
  faqs?: { q: string; a: string }[]
  slug?: string
  sort?: number
}

/** 案例列表项 */
export interface CaseItem {
  id: string
  pageId?: string | null
  path: string
  title: string
  /** 行业分类 ID（ProductIndustry.id；未分类为空串/null） */
  industryId?: string | null
  industry: string
  /** 业主 / 客户 */
  client: string
  location: string
  area: string
  year: string
  system: string
  img: string
  sort: number
  status: string
}

/** 案例详情（含正文与结构化字段，编辑回显用） */
export interface CaseDetail extends CaseItem {
  slug: string
  /** 使用体系副项 / 备注 */
  systemNote: string
  lead: string
  chips: string[]
  bgImage: string
  /** 案例正文纯文本（bodyBlocks 的派生列） */
  body: string
  /** 案例正文结构化块（与新闻同一套，支持图片 / 视频 / 表格） */
  bodyBlocks: ArticleBlock[]
  images: Record<string, unknown>[]
  /** 抓取 / 录入来源页 */
  sourceUrl: string
}

/** 案例保存载荷（行业只收分类 ID；bodyBlocks 为主数据，body 为兼容派生列） */
export interface CasePayload {
  title: string
  industryId?: string
  /** 兼容字段：必须是分类表已有名称，服务端未命中返回 400 */
  industry?: string
  client?: string
  location?: string
  area?: string
  year?: string
  system?: string
  systemNote?: string
  img?: string
  lead?: string
  chips?: string[]
  bgImage?: string
  body?: string
  bodyBlocks?: ArticleBlock[]
  images?: Record<string, unknown>[]
  sourceUrl?: string
  slug?: string
  sort?: number
}

/** 行业分组清单（列表页、产品弹窗的分组下拉共用） */
export const catalogApi = {
  // ---------------- 行业分组 ----------------
  industries(siteId: string) {
    return get<{ list: ProductIndustryItem[] }>('/catalog/industries', { siteId })
  },
  createIndustry(payload: { siteId: string; name: string; desc?: string; moreLabel?: string; sort?: number }) {
    return post<{ id: string }>('/catalog/industries', payload)
  },
  updateIndustry(id: string, payload: { name?: string; desc?: string; moreLabel?: string; sort?: number }) {
    return patch<{ id: string }>(`/catalog/industries/${id}`, payload)
  },
  removeIndustry(id: string) {
    return del<{ id: string }>(`/catalog/industries/${id}`)
  },

  // ---------------- 产品 ----------------
  products(params: {
    siteId: string
    page?: number
    pageSize?: number
    keyword?: string
    series?: string
    industry?: string
  }) {
    return get<Paged<ProductItem> & { seriesList: string[] }>('/catalog/products', params as Record<string, unknown>)
  },
  /** 产品单条详情（列表不含详情字段，编辑弹窗回显用） */
  productDetail(id: string) {
    return get<ProductDetail>(`/catalog/products/${id}/detail`)
  },
  createProduct(payload: ProductPayload & { siteId: string }) {
    return post<ProductItem>('/catalog/products', payload)
  },
  updateProduct(id: string, payload: Partial<ProductPayload>) {
    return patch<ProductItem>(`/catalog/products/${id}`, payload)
  },
  removeProduct(id: string) {
    return del<{ id: string }>(`/catalog/products/${id}`)
  },

  // ---------------- 成功案例 ----------------
  cases(params: { siteId: string; page?: number; pageSize?: number; keyword?: string; industry?: string }) {
    return get<Paged<CaseItem> & { industryList: string[] }>('/catalog/cases', params as Record<string, unknown>)
  },
  caseDetail(id: string) {
    return get<CaseDetail>(`/catalog/cases/${id}/detail`)
  },
  createCase(payload: CasePayload & { siteId: string }) {
    return post<CaseItem>('/catalog/cases', payload)
  },
  updateCase(id: string, payload: Partial<CasePayload>) {
    return patch<CaseItem>(`/catalog/cases/${id}`, payload)
  },
  removeCase(id: string) {
    return del<{ id: string }>(`/catalog/cases/${id}`)
  }
}
