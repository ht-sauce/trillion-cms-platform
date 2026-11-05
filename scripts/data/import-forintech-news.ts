import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { loadConfig } from '../../config/index.mjs'
import { sanitizeArticleHtml, htmlToText } from '../../apps/server/src/common/utils/article-html'
import { computePageContentHash } from '../../apps/server/src/common/utils/content-hash'

type HtmlNode = { text?: string; tag?: string; attrs?: Record<string, string>; children?: HtmlNode[] }
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function renderNodes(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.text !== undefined) return escape(node.text)
      const tag = node.tag || 'span'
      const attrs = Object.entries(node.attrs || {})
        .map(([key, value]) => ` ${key}="${escape(value)}"`)
        .join('')
      if (tag === 'img' || tag === 'br') return `<${tag}${attrs}>`
      return `<${tag}${attrs}>${renderNodes(node.children || [])}</${tag}>`
    })
    .join('')
}

const norm = (value: string) =>
  value
    .replace(/^Forintech[\s:：-]*/i, '')
    .replace(/^富林泛泰[\s:：-]*/i, '')
    .replace(/[\s\u200b-\u200d\ufeff·・]/g, '')
    .toLowerCase()
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const source = '富林泛泰官网 · 新闻重采'
const listUrl = 'https://sea.forintech.com/zh/media'

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args[args.indexOf(name) + 1]
  const apply = args.includes('--apply')
  const first = args.includes('--first')
  const dir = args.includes('--work-dir')
    ? path.resolve(arg('--work-dir'))
    : path.join(os.tmpdir(), 'forintech-news-20261104')
  if (!dir.startsWith(os.tmpdir() + path.sep)) throw new Error('工作目录必须位于系统临时目录')
  fs.mkdirSync(dir, { recursive: true })
  const save = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2))
  const config = loadConfig({ appEnv: args.includes('--env') ? arg('--env') : 'development' })
  const require = createRequire(path.join(config.root, 'apps/server/package.json'))
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: config.database.url } } })
  const report: any = {
    environment: config.appEnv,
    database: config.database.name,
    mode: apply ? 'apply' : 'dry-run',
    first,
    failures: [],
    articles: [],
    images: []
  }
  let browser: any
  try {
    const site = await prisma.site.findUnique({ where: { slug: 'forintech' } })
    if (!site) throw new Error('未找到 forintech 站点')
    const siteId = site.id
    const protectedState = async () => ({
      cases: await prisma.caseStudy.findMany({ orderBy: { id: 'asc' } }),
      pages: await prisma.page.findMany({
        where: { NOT: { AND: [{ siteId }, { OR: [{ path: '/news' }, { path: { startsWith: '/news/' } }] }] } },
        orderBy: { id: 'asc' }
      }),
      otherNews: await prisma.newsArticle.findMany({ where: { siteId: { not: siteId } }, orderBy: { id: 'asc' } }),
      products: await prisma.product.findMany({ orderBy: { id: 'asc' } }),
      faqs: await prisma.faqItem.findMany({ orderBy: { id: 'asc' } })
    })
    const news = await prisma.newsArticle.findMany({ where: { siteId }, orderBy: { id: 'asc' } })
    const pages = await prisma.page.findMany({
      where: { siteId, OR: [{ path: '/news' }, { path: { startsWith: '/news/' } }] },
      orderBy: { id: 'asc' }
    })
    const protectedBefore = await protectedState()
    report.beforeCount = news.length
    if (apply)
      save(`backup-${first ? 'first' : 'batch'}-${Date.now()}.json`, {
        siteId,
        news,
        pages,
        protected: protectedBefore
      })
    const modulePath = args.includes('--browser-module') ? arg('--browser-module') : ''
    if (!modulePath) throw new Error('必须提供 --browser-module，依赖安装在系统临时目录，不修改仓库依赖')
    const { chromium } = await import(pathToFileURL(modulePath).href)
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.addInitScript('globalThis.__name = (fn) => fn')
    const response = await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (response.status() !== 200) throw new Error(`媒体页 HTTP ${response.status()}`)
    await page.locator('a[href*="/zh/post/"]').first().waitFor()
    for (let step = 0; step < 8; step++) {
      const count = await page.locator('a[href*="/zh/post/"]').count()
      await page.locator('footer').last().scrollIntoViewIfNeeded()
      try {
        await page.waitForFunction((n: number) => document.querySelectorAll('a[href*="/zh/post/"]').length > n, count, {
          timeout: 6000
        })
      } catch {
        break
      }
    }
    const links: string[] = await page.evaluate(() => [
      ...new Set(Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/zh/post/"]')).map((a) => a.href))
    ])
    save('links.json', links)
    report.discovered = links.length
    if (links.length < news.length) throw new Error('发现新闻少于存量，拒绝按不完整列表写库')
    const crawlFile = path.join(dir, 'crawl.json')
    const crawled: any[] = fs.existsSync(crawlFile) ? JSON.parse(fs.readFileSync(crawlFile, 'utf8')) : []
    const firstReportPath = path.join(dir, 'report-first.json')
    const firstReport = fs.existsSync(firstReportPath) ? JSON.parse(fs.readFileSync(firstReportPath, 'utf8')) : null
    const completedPath = path.join(dir, 'completed.json')
    const completed: string[] = fs.existsSync(completedPath) ? JSON.parse(fs.readFileSync(completedPath, 'utf8')) : []
    if (apply && !first && firstReport?.mode === 'apply' && !firstReport.failures.length)
      completed.push(...firstReport.articles.map((p: any) => p.url))
    for (const url of first ? links.slice(0, 1) : links) {
      if (apply && !first && completed.includes(url)) continue
      let post = crawled.find((p) => p.url === url)
      if (!post) {
        try {
          const result = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
          if (result.status() !== 200) throw new Error(`详情页 HTTP ${result.status()}`)
          await page.locator('[data-hook="post-description"]').waitFor()
          post = await page.evaluate(() => {
            const container = document.querySelector('[data-hook="post-description"]')!
            const clean = (el: Node, inline = false): any[] => {
              if (el.nodeType === Node.TEXT_NODE) return [{ text: el.textContent || '' }]
              if (!(el instanceof Element)) return []
              const original = el.tagName.toLowerCase()
              if (['script', 'style', 'svg', 'button'].includes(original) || el.getAttribute('aria-hidden') === 'true')
                return []
              let tag = original
              if (el.hasAttribute('data-ricos-paragraph')) tag = 'p'
              if (el.hasAttribute('data-ricos-heading'))
                tag = ['h2', 'h3', 'h4'].includes(original) && (el.textContent || '').length <= 80 ? original : 'p'
              if (inline && ['p', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) tag = 'span'
              if (
                ![
                  'p',
                  'h2',
                  'h3',
                  'h4',
                  'b',
                  'strong',
                  'i',
                  'em',
                  'u',
                  's',
                  'del',
                  'code',
                  'br',
                  'ul',
                  'ol',
                  'li',
                  'a',
                  'img',
                  'span',
                  'blockquote',
                  'table',
                  'tbody',
                  'thead',
                  'tr',
                  'td',
                  'th'
                ].includes(tag)
              )
                return Array.from(el.childNodes).flatMap((n) => clean(n, inline))
              const attrs: Record<string, string> = {}
              if (tag === 'img') {
                const src = el.getAttribute('src') || ''
                if (!src.includes('wixstatic.com/media/')) return []
                attrs.src = decodeURI(src).replace(/\/v1\/.*$/i, '')
                attrs.alt = el.getAttribute('alt') || ''
                for (const key of ['width', 'height']) {
                  const v = el.getAttribute(key)
                  if (v && /^\d+$/.test(v)) attrs[key] = v
                }
              }
              if (tag === 'a') attrs.href = el.getAttribute('href') || ''
              if (el.hasAttribute('style')) attrs.style = el.getAttribute('style') || ''
              const children = Array.from(el.childNodes).flatMap((n) => clean(n, inline || tag === 'li' || tag === 'p'))
              if (tag === 'p' && !el.textContent?.trim() && !el.querySelector('img')) return []
              return [{ tag, attrs, children }]
            }
            const nodes = Array.from(container.querySelectorAll('[data-breakout]')).flatMap((el) => {
              if (el.parentElement?.closest('[data-breakout]')) return []
              const result = Array.from(el.childNodes).flatMap((n) => clean(n))
              return result.map((n) => (n.tag === 'img' ? { tag: 'p', children: [n] } : n))
            })
            const schema = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
              .map((s) => {
                try {
                  return JSON.parse(s.textContent || '')
                } catch {
                  return null
                }
              })
              .find((s) => s?.['@type'] === 'BlogPosting')
            return {
              url: location.href,
              title: document.querySelector('[data-hook="post-title"]')?.textContent?.trim(),
              nodes,
              date: schema?.datePublished?.slice(0, 10),
              description: schema?.description,
              cover: (document.querySelector('[data-hook="post-hero-image"] img') as HTMLImageElement)?.src?.replace(
                /\/v1\/.*$/i,
                ''
              )
            }
          })
          post.bodyHtml = sanitizeArticleHtml(renderNodes(post.nodes))
          post.content = htmlToText(post.bodyHtml)
          if (!post.title || !post.content.trim()) throw new Error('标题或正文为空')
          if (Buffer.byteLength(post.bodyHtml) > 65000) throw new Error('正文超过数据库 TEXT 容量')
          crawled.push(post)
          save('crawl.json', crawled)
          if (first)
            await page
              .locator('[data-hook="post-description"]')
              .screenshot({ path: path.join(dir, 'source-first.png') })
        } catch (error) {
          report.failures.push({ url, stage: 'crawl', error: String(error) })
          continue
        }
      }
      const matches = news.filter((n: any) => norm(n.title) === norm(post.title))
      if (matches.length > 1) {
        report.failures.push({ url, stage: 'match', error: '标题匹配不唯一' })
        continue
      }
      const existing = matches[0]
      const imageUrls = [
        ...new Set(
          [...post.bodyHtml.matchAll(/<img[^>]*src="([^"]+)"/g)]
            .map((m: any) => m[1])
            .concat(post.cover ? [post.cover] : [])
        )
      ] as string[]
      let bodyHtml = post.bodyHtml
      let cover = post.cover || imageUrls[0] || null
      try {
        for (const imageUrl of imageUrls) {
          const originalName = decodeURIComponent(new URL(imageUrl).pathname.split('/').pop() || '')
          const cached = path.join(dir, originalName)
          if (!fs.existsSync(cached)) {
            const res = await fetch(imageUrl.replace('static.wixstatic.com', 'images.wixstatic.com'), {
              signal: AbortSignal.timeout(60000)
            })
            if (!res.ok || !res.headers.get('content-type')?.startsWith('image/'))
              throw new Error(`图片响应无效 ${imageUrl} HTTP ${res.status}`)
            fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()))
          }
          const bytes = fs.readFileSync(cached)
          if (!bytes.length) throw new Error(`图片为空 ${imageUrl}`)
          let publicUrl = imageUrl
          if (apply) {
            const file = await prisma.staticFile.findFirst({ where: { siteId, source, originalName } })
            if (file) {
              publicUrl = file.publicUrl
              if (!fs.existsSync(path.join(config.root, 'apps/server', file.storagePath)))
                throw new Error(`已登记图片缺失 ${publicUrl}`)
            } else {
              const ext = path.extname(originalName).toLowerCase()
              const mimeType = (
                {
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.png': 'image/png',
                  '.webp': 'image/webp',
                  '.gif': 'image/gif'
                } as Record<string, string>
              )[ext]
              if (!mimeType) throw new Error(`图片类型不支持 ${originalName}`)
              const now = new Date()
              const relative = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`
              const storagePath = `uploads/${relative}`
              const target = path.join(config.root, 'apps/server', storagePath)
              fs.mkdirSync(path.dirname(target), { recursive: true })
              fs.writeFileSync(target, bytes)
              publicUrl = `/static/${relative}`
              await prisma.staticFile.create({
                data: {
                  siteId,
                  source,
                  originalName,
                  storagePath,
                  publicUrl,
                  sizeBytes: bytes.length,
                  mimeType,
                  caption: post.title
                }
              })
            }
          }
          bodyHtml = bodyHtml.split(escape(imageUrl)).join(escape(publicUrl))
          if (cover === imageUrl) cover = publicUrl
          report.images.push({ source: imageUrl, publicUrl, bytes: bytes.length, sha256: hash(bytes) })
        }
        const slug = existing?.slug || randomUUID()
        const summary = String(post.description || post.content.split('\n')[0]).slice(0, 500)
        const publishDate = existing?.publishDate || post.date
        if (!publishDate) throw new Error('缺少发布日期')
        if (apply) {
          const template = existing
            ? pages.find((p: any) => p.id === existing.pageId)
            : pages.find((p: any) => p.kind === 'detail')
          if (!template) throw new Error('新闻详情模板不存在')
          const blocks = template.blocks.map((b: any) => {
            if (b.key === 'article-body') return { ...b, data: { ...b.data, html: bodyHtml, blocks: [] } }
            if (b.key === 'hero-dark') {
              const data = { ...b.data, h1: post.title, lead: summary.slice(0, 120), bgImage: cover }
              if (data.h1Grad && !post.title.includes(data.h1Grad)) delete data.h1Grad
              return { ...b, data }
            }
            if (b.key === 'article-meta') return { ...b, data: { ...b.data, date: publishDate } }
            return b
          })
          const definitions = await prisma.blockDefinition.findMany({ where: { siteId } })
          const codeHashOf = (key: string) => definitions.find((b: any) => b.key === key)?.codeHash || ''
          const pageData = { title: post.title, summary, blocks }
          await prisma.$transaction(
            async (tx: any) => {
              let pageId = existing?.pageId
              if (existing) {
                await tx.page.update({
                  where: { id: pageId, siteId },
                  data: { ...pageData, contentHash: computePageContentHash({ ...template, ...pageData }, codeHashOf) }
                })
                await tx.newsArticle.update({
                  where: { id: existing.id, siteId },
                  data: { title: post.title, summary, bodyHtml, content: htmlToText(bodyHtml), cover }
                })
              } else {
                const { id, createdAt, updatedAt, publishedAt, publishedHash, contentHash, draft, ...base } = template
                const newPage = {
                  ...base,
                  ...pageData,
                  slug,
                  path: `/news/${slug}`,
                  sort: pages.length,
                  publishedHash: ''
                }
                const created = await tx.page.create({
                  data: { ...newPage, contentHash: computePageContentHash(newPage, codeHashOf) }
                })
                pageId = created.id
                await tx.newsArticle.create({
                  data: {
                    siteId,
                    slug,
                    title: post.title,
                    summary,
                    bodyHtml,
                    content: htmlToText(bodyHtml),
                    cover,
                    publishDate,
                    pageId
                  }
                })
              }
            },
            { timeout: 20000 }
          )
        }
        report.articles.push({
          title: post.title,
          url,
          slug,
          action: existing ? 'update' : 'create',
          images: imageUrls.length,
          htmlBytes: Buffer.byteLength(bodyHtml),
          sequence: post.nodes.map((n: any) => n.tag),
          htmlSha256: hash(bodyHtml)
        })
        if (apply) {
          completed.push(url)
          save('completed.json', [...new Set(completed)])
        }
        console.log(`${apply ? '写入' : '核对'} ${report.articles.length}: ${post.title} · 图片 ${imageUrls.length}`)
      } catch (error) {
        report.failures.push({ url, title: post.title, stage: 'images-or-write', error: String(error) })
      }
      save(`report-${first ? 'first' : 'batch'}.json`, report)
    }
    if (apply && report.articles.length) {
      const all = await prisma.newsArticle.findMany({
        where: { siteId },
        orderBy: [{ publishDate: 'desc' }, { id: 'desc' }]
      })
      const list = pages.find((p: any) => p.path === '/news')
      const blocks = list.blocks.map((b: any) =>
        b.key === 'post-list'
          ? {
              ...b,
              data: {
                ...b.data,
                items: all.map((n: any) => ({
                  href: `/news/${n.slug}`,
                  title: n.title,
                  summary: n.summary,
                  publishDate: n.publishDate,
                  cover: n.cover || ''
                }))
              }
            }
          : b
      )
      const definitions = await prisma.blockDefinition.findMany({ where: { siteId } })
      await prisma.page.update({
        where: { id: list.id, siteId },
        data: {
          blocks,
          contentHash: computePageContentHash(
            { ...list, blocks },
            (key) => definitions.find((b: any) => b.key === key)?.codeHash || ''
          )
        }
      })
    }
    const protectedAfter = await protectedState()
    report.protectedHashes = Object.fromEntries(
      Object.keys(protectedBefore).map((key) => [
        key,
        {
          before: hash((protectedBefore as any)[key]),
          after: hash((protectedAfter as any)[key]),
          unchanged: hash((protectedBefore as any)[key]) === hash((protectedAfter as any)[key])
        }
      ])
    )
    report.afterCount = await prisma.newsArticle.count({ where: { siteId } })
    save(`report-${first ? 'first' : 'batch'}.json`, report)
    console.log(
      JSON.stringify({
        discovered: report.discovered,
        processed: report.articles.length,
        before: report.beforeCount,
        after: report.afterCount,
        failures: report.failures,
        protectedHashes: report.protectedHashes,
        workDir: dir
      })
    )
    if (report.failures.length || Object.values(report.protectedHashes).some((v: any) => !v.unchanged))
      process.exitCode = 1
  } finally {
    await browser?.close()
    await prisma.$disconnect()
  }
}
if (process.argv[1]?.endsWith('import-forintech-news.ts'))
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
