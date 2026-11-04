/**
 * 新闻资讯 / 常见问题接口（news-faq 模块）
 * 两类内容以独立数据表为管理源：列表 / 详情直接读表，增删改都按表记录 id 寻址；
 * pageId 为关联页面 id（可空，仅供展示关联关系），保存后由服务端自动触发站点构建
 * 列表接口不返回正文，编辑回显走各单条详情接口（articleDetail / faqDetail，不传 siteId）
 */
import { get, post, patch, put, del, type Paged } from './http'

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
  /** 封面图（素材库 publicUrl，/static/... 形态；可空） */
  cover?: string | null
}

/** 新闻正文块（段落 / 小标题 / 图片 / 表格 / 视频，ADR-053 / ADR-054；服务端白名单收口同口径） */
export interface ArticleBlock {
  /** 块类型 */
  kind: 'paragraph' | 'heading' | 'image' | 'table' | 'video'
  /** 段落 / 小标题文本（纯文本，服务端由 html 派生，GEO 与摘要读它） */
  text?: string
  /** 段落 / 小标题的行内富文本（b/strong/i/em/u/s/del/code/br + 受控 span 样式，服务端白名单化） */
  html?: string
  /** 段落 / 小标题 / 表格对齐 */
  align?: 'left' | 'center' | 'right'
  /** 图片 / 视频地址（素材库 publicUrl，/static/... 形态） */
  src?: string
  /** 图片替代文本 */
  alt?: string
  /** 图片 / 视频说明（渲染为图注） */
  caption?: string
  /** 小标题层级（2~4，缺省 2） */
  level?: number
  /** 表格内容：二维数组，单元格为白名单化行内 html */
  rows?: string[][]
  /** 表格首行是否为表头（缺省 true） */
  header?: boolean
  /** 视频封面（可选） */
  poster?: string
}

/** 新闻文章详情（含正文，编辑回显用） */
export interface NewsArticleDetail extends NewsArticleItem {
  /** 正文纯文本（bodyHtml 的派生列，段落间 \n 分隔） */
  content: string
  /** 正文整篇 HTML（主数据；历史文章已由服务端由块数组转换） */
  bodyHtml: string
  /** 结构化正文块（历史兼容，前端不再用于渲染） */
  body?: ArticleBlock[]
  /** URL 片段（创建时可留空由服务端按标题生成） */
  slug: string
}

/** 新闻文章保存载荷（创建：全量；更新：按需传字段） */
export interface NewsArticlePayload {
  title: string
  summary?: string
  /** 发布日期（YYYY-MM-DD；创建时不允许早于今天，编辑现有日期不受限） */
  publishDate: string
  /** 正文整篇 HTML（主数据，服务端白名单化并派生 content） */
  bodyHtml?: string
  /** 正文纯文本（bodyHtml 为空时的历史回落） */
  content?: string
  slug?: string
}

/** 常见问题列表项 */
export interface FaqItem {
  /** 表记录 ID（问答管理源定位，增删改都按它寻址） */
  id: string
  /** 关联页面 ID（可空：尚未生成页面时为空） */
  pageId?: string
  path: string
  question: string
  category: string
  status: string
  /** 是否在问答列表页上架展示（false = 仅保留详情页，不进分类区块与全部问题列表） */
  featured: boolean
}

/** 常见问题详情（含答案，编辑回显用） */
export interface FaqDetail extends FaqItem {
  /** 答案纯文本（段落间 \n 分隔；JSON-LD / 搜索用） */
  answer: string
  /** 答案受限富文本（段落 / 有序无序列表 / 行内标记；编辑回显与前台结构展示用，历史数据可能为空） */
  answerHtml: string
}

/** 关联问题回显（auto=true 表示当前走「同分类其它问答」自动口径） */
export interface FaqRelatedInfo {
  id: string
  auto: boolean
  /** 按展示顺序排列的关联问答 id */
  ids: string[]
  items: { id: string; question: string; category: string }[]
}

/** 常见问题保存载荷（发布日期为新闻资讯专属，问答无此字段） */
export interface FaqPayload {
  question: string
  category: string
  /** 答案纯文本（由富文本去标签派生；服务端在只收到 answerHtml 时也会自己派生） */
  answer?: string
  /** 答案受限富文本（服务端白名单化后才入库） */
  answerHtml?: string
  /** 是否在列表页上架展示 */
  featured?: boolean
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

  // ---------------- 常见问题 ----------------
  faqList(params: {
    siteId: string
    page?: number
    pageSize?: number
    keyword?: string
    category?: string
    /** 上架状态筛选：'1' 只看上架 / '0' 只看未上架 / 不传为全部 */
    featured?: '1' | '0'
  }) {
    return get<Paged<FaqItem>>('/news-faq/faqs', params as Record<string, unknown>)
  },
  /** 站点下已有问答分类（去重后的字符串清单，筛选下拉与表单下拉共用） */
  faqCategories(siteId: string) {
    return get<{ list: string[] }>('/news-faq/categories', { siteId })
  },
  /** 常见问题单条详情（列表不含答案，编辑弹窗回显用；按表记录 id 寻址） */
  faqDetail(id: string) {
    return get<FaqDetail>(`/news-faq/faqs/${id}/detail`)
  },
  createFaq(payload: FaqPayload & { siteId: string }) {
    return post<FaqItem>('/news-faq/faqs', payload)
  },
  updateFaq(id: string, payload: Partial<FaqPayload>) {
    return patch<FaqItem>(`/news-faq/faqs/${id}`, payload)
  },
  /** 上架状态切换（只影响问答列表页展示，详情页保留；服务端重算列表页并触发发布） */
  setFaqFeatured(id: string, featured: boolean) {
    return patch<{ id: string; featured: boolean }>(`/news-faq/faqs/${id}/featured`, { featured })
  },
  /** 关联问题读取（未手工指定时返回自动口径实际命中的那组） */
  getFaqRelated(id: string) {
    return get<FaqRelatedInfo>(`/news-faq/faqs/${id}/related`)
  },
  /** 关联问题保存（按数组顺序展示；传空数组 = 恢复自动口径） */
  setFaqRelated(id: string, ids: string[]) {
    return put<{ id: string; ids: string[]; auto: boolean }>(`/news-faq/faqs/${id}/related`, { ids })
  },
  removeFaq(id: string) {
    return del<{ id: string }>(`/news-faq/faqs/${id}`)
  }
}
