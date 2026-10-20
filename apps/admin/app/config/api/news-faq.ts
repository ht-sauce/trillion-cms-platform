/**
 * 新闻资讯 / 高频问答接口（news-faq 模块）
 * 两类内容以独立数据表为管理源：列表 / 详情直接读表，增删改都按表记录 id 寻址；
 * pageId 为关联页面 id（可空，仅供展示关联关系），保存后由服务端自动触发站点构建
 * 列表接口不返回正文，编辑回显走各单条详情接口（articleDetail / faqDetail，不传 siteId）
 */
import { get, post, patch, del, type Paged } from './http'

/** 新闻文章列表项 */
export interface NewsArticleItem {
  /** 表记录 ID（新闻管理源定位，增删改都按它寻址） */
  id: string
  /** 关联页面 ID（可空：尚未生成页面时为空） */
  pageId?: string
  /** 页面访问路径 */
  path: string
  title: string
  summary: string
  /** 发布日期（YYYY-MM-DD，必填，不允许早于今天） */
  publishDate: string
  /** 页面发布状态（published / pending / missing / draft） */
  status: string
}

/** 新闻文章详情（含正文，编辑回显用） */
export interface NewsArticleDetail extends NewsArticleItem {
  /** 正文纯文本（段落间 \n 分隔） */
  content: string
  /** URL 片段（创建时可留空由服务端按标题生成） */
  slug: string
}

/** 新闻文章保存载荷（创建：全量；更新：按需传字段） */
export interface NewsArticlePayload {
  title: string
  summary?: string
  /** 发布日期（YYYY-MM-DD，服务端强校验：必填且不允许早于今天） */
  publishDate: string
  content?: string
  slug?: string
}

/** 高频问答列表项 */
export interface FaqItem {
  /** 表记录 ID（问答管理源定位，增删改都按它寻址） */
  id: string
  /** 关联页面 ID（可空：尚未生成页面时为空） */
  pageId?: string
  path: string
  question: string
  category: string
  status: string
}

/** 高频问答详情（含答案，编辑回显用） */
export interface FaqDetail extends FaqItem {
  /** 答案纯文本（段落间 \n 分隔） */
  answer: string
}

/** 高频问答保存载荷（发布日期为新闻资讯专属，问答无此字段） */
export interface FaqPayload {
  question: string
  category: string
  answer?: string
}

export const newsFaqApi = {
  // ---------------- 新闻资讯 ----------------
  articleList(params: { siteId: string; page?: number; pageSize?: number; keyword?: string }) {
    return get<Paged<NewsArticleItem>>('/news-faq/articles', params as Record<string, unknown>)
  },
  /** 新闻文章单条详情（列表不含正文，编辑弹窗回显用；按表记录 id 寻址） */
  articleDetail(id: string) {
    return get<NewsArticleDetail>(`/news-faq/articles/${id}/detail`)
  },
  createArticle(payload: NewsArticlePayload & { siteId: string }) {
    return post<NewsArticleItem>('/news-faq/articles', payload)
  },
  updateArticle(id: string, payload: Partial<NewsArticlePayload>) {
    return patch<NewsArticleItem>(`/news-faq/articles/${id}`, payload)
  },
  removeArticle(id: string) {
    return del<{ id: string }>(`/news-faq/articles/${id}`)
  },

  // ---------------- 高频问答 ----------------
  faqList(params: { siteId: string; page?: number; pageSize?: number; keyword?: string; category?: string }) {
    return get<Paged<FaqItem>>('/news-faq/faqs', params as Record<string, unknown>)
  },
  /** 站点下已有问答分类（去重后的字符串清单，筛选下拉与表单下拉共用） */
  faqCategories(siteId: string) {
    return get<{ list: string[] }>('/news-faq/categories', { siteId })
  },
  /** 高频问答单条详情（列表不含答案，编辑弹窗回显用；按表记录 id 寻址） */
  faqDetail(id: string) {
    return get<FaqDetail>(`/news-faq/faqs/${id}/detail`)
  },
  createFaq(payload: FaqPayload & { siteId: string }) {
    return post<FaqItem>('/news-faq/faqs', payload)
  },
  updateFaq(id: string, payload: Partial<FaqPayload>) {
    return patch<FaqItem>(`/news-faq/faqs/${id}`, payload)
  },
  removeFaq(id: string) {
    return del<{ id: string }>(`/news-faq/faqs/${id}`)
  }
}
