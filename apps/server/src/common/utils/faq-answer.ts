/**
 * 问答答案的结构化存储与清洗（ADR-058）
 *
 * 为什么需要它：
 *   原站（Wix）的答案在页面上是**纯文本**——「1. 颜色… 2. 表面处理… 3. 为什么…」这些编号是
 *   文本里的字符，没有 `<ol>/<li>` 结构（抓 innerHTML 拿到的 tag 数为 0）。直接存纯文本，
 *   前台只能整段铺开，读起来「全糅在一起」。
 *
 * 所以答案在管理面按**受限富文本**存（`FaqItem.answerHtml`）：
 *   允许 段落 `p` / 换行 `br` / 加粗 `b|strong` / 斜体 `i|em` / 下划线 `u` / 删除线 `s` /
 *   有序列表 `ol>li` / 无序列表 `ul>li`；属性一律丢弃（链接在问答里没有业务价值，且要处理 href 白名单）。
 *   `answer` 列继续存由 HTML 去标签派生的纯文本，供 JSON-LD、搜索、摘要复用。
 *
 * **安全口径**与 `article-body.ts` 一致：先整体转义，再还原白名单标签——顺序反了等于没做。
 *
 * 存量数据与爬取数据的结构化还原（`plainTextToFaqHtml`）：
 *   识别「1. / 2. / 3.」连续编号 → 有序列表；其余按空行切段落。宁可少转（识别不出就当段落），
 *   也不要把正文里的「2.4 毫米」误判成列表项——规则是「编号必须从 1 开始连续递增」。
 */

/** 块级白名单标签（问答答案可用） */
const BLOCK_TAGS = 'p|ol|ul|li'
/** 行内白名单标签 */
const INLINE_TAGS = 'b|strong|i|em|u|s'
/** 单个答案 HTML 上限（防御性，正常答案几百字） */
const HTML_MAX = 20000

/** HTML 转义（尖括号与 &） */
function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 标签还原：把转义后的白名单标签（无属性）还原成真标签 */
function restoreTags(escaped: string, tags: string): string {
  const pattern = new RegExp(`&lt;(/?)(${tags})&gt;`, 'gi')
  return escaped.replace(pattern, (_all, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
}

/**
 * 答案 HTML 白名单化：先整体转义、再还原白名单标签，属性全部丢弃。
 * 输出可直接 `v-html`。
 */
export function sanitizeFaqAnswerHtml(raw: unknown): string {
  const text = String(raw ?? '').slice(0, HTML_MAX)
  if (!text.trim()) return ''

  const normalized = text
    /** 脚本与样式整段删除（连内容一起，避免把代码当正文显示） */
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    /** 换行标签先还原成空行，最后统一按块处理 */
    .replace(/<br\s*\/?>/gi, '\n')
    /** 白名单之外的标签（script/style/a/table/span…）整段去掉，只留标签内的文字 */
    .replace(/<(?!\/?(?:p|ol|ul|li|b|strong|i|em|u|s)\b)[^>]*>/gi, '')
    /** 白名单标签的属性全部丢弃：`<p class="x">` → `<p>` */
    .replace(/<(\/?)(p|ol|ul|li|b|strong|i|em|u|s)\b[^>]*>/gi, '<$1$2>')

  /** 先整体转义，再还原白名单标签（顺序反了等于没做） */
  const escaped = escapeHtml(normalized)
  const restored = restoreTags(escaped, `${BLOCK_TAGS}|${INLINE_TAGS}`)

  return (
    restored
      /** 去掉空段落 / 空列表项 */
      .replace(/<li>\s*<\/li>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/<(ol|ul)>\s*<\/(ol|ul)>/gi, '')
      /** 段落之间的裸换行按分段处理，段落内的换行按 <br> */
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .trim()
  )
}

/** 答案 HTML → 纯文本（段落 / 列表项各占一行；JSON-LD、搜索、摘要读它） */
export function faqAnswerHtmlToText(html: unknown): string {
  return String(html ?? '')
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/** 编号行：`1.` / `1、` / `1）`（后面不能紧跟数字，避免把「2.4mm」当编号） */
const ORDERED_LINE = /^(\d{1,2})[.、．)）]\s*(?!\d)(.+)$/

/**
 * 纯文本 → 结构化 HTML（存量数据与爬取数据的还原规则）：
 *   - 先按空行切段（原文没有空行时就是一段）
 *   - 段内若出现「从 1 开始连续递增」的编号行，收成 `<ol><li>`
 *   - 其余内容按 `<p>` 输出
 * 保守策略：编号不从 1 开始或不连续，就不当列表，整段保留为段落。
 */
export function plainTextToFaqHtml(text: unknown): string {
  const raw = String(text ?? '').trim()
  if (!raw) return ''

  /** 编号可能挤在同一行（原站常见：「…。2. 表面处理…」），先在编号前断行 */
  const normalized = raw
    .replace(/([^\n])\s*(\d{1,2})[.、．)）]\s*(?!\d)/g, (all, before: string, num: string) => {
      /** 只在前一个字符是句末标点 / 冒号 / 分号时才断行，避免误伤正文里的数字 */
      return /[。；;：:！!？?、]$/.test(before) ? `${before}\n${num}. ` : all
    })
    .replace(/\r/g, '')

  const blocks = normalized.split(/\n{2,}/)
  const html: string[] = []

  for (const block of blocks) {
    const lines = block
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) continue

    /** 段落内找连续编号行，收成列表 */
    const chunks: string[] = []
    let listItems: string[] = []
    let expected = 1

    const flushList = () => {
      if (!listItems.length) return
      chunks.push(`<ol>${listItems.map((item) => `<li>${item}</li>`).join('')}</ol>`)
      listItems = []
      expected = 1
    }

    for (const line of lines) {
      const matched = ORDERED_LINE.exec(line)
      const num = matched ? Number(matched[1]) : 0
      if (matched && num === expected) {
        listItems.push(matched[2].trim())
        expected += 1
        continue
      }
      /** 编号断了：先把已有列表收掉，当前行按普通段落处理 */
      flushList()
      if (matched && num === 1) {
        listItems.push(matched[2].trim())
        expected = 2
        continue
      }
      chunks.push(`<p>${line}</p>`)
    }
    flushList()
    html.push(chunks.join(''))
  }

  return sanitizeFaqAnswerHtml(html.join(''))
}

/**
 * 管理端只给了纯文本（老接口 / 仅改文字）时的兜底：
 * 有 answerHtml 用 answerHtml，没有就按上面规则从纯文本还原结构。
 */
export function resolveFaqAnswer(input: { answer?: string; answerHtml?: string }): {
  answer: string
  answerHtml: string
} {
  const html = sanitizeFaqAnswerHtml(input.answerHtml ?? '')
  if (html) return { answer: faqAnswerHtmlToText(html), answerHtml: html }

  const plain = String(input.answer ?? '').trim()
  if (!plain) return { answer: '', answerHtml: '' }
  const generated = plainTextToFaqHtml(plain)
  return { answer: faqAnswerHtmlToText(generated) || plain, answerHtml: generated }
}
