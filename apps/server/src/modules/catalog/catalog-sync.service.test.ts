import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { CatalogSyncService, type CaseView, type ProductView } from './catalog-sync.service'
import { NewsFaqSyncService } from '../news-faq/news-faq-sync.service'
import { blockData, type BlockInstanceInput } from '../../common/utils/block-instances'

const sync = new CatalogSyncService(null!, null!)
const block = (key: string, data: Record<string, unknown> = {}, id = key): BlockInstanceInput => ({
  id,
  key,
  enabled: true,
  data
})
const template = [
  block('hero-dark', {
    h1: '旧案例',
    lead: '旧导语',
    chips: ['旧标签'],
    bgImage: '/old.jpg',
    eyebrow: '旧行业',
    orgline: '旧业主',
    h1Grad: '案例'
  }),
  block('section-head', { title: '项目信息' }, 'info-head'),
  block('glass-card', { title: '项目信息', badge: '旧行业', rows: [{ k: '业主', v: '旧业主' }] }),
  block('section-head', { title: '案例正文' }, 'body-head'),
  block('article-body', { html: '<p>旧正文</p>', blocks: [{ kind: 'paragraph', text: '旧正文' }] }),
  block('section-head', { title: '项目画面' }, 'grid-head'),
  block('env-grid', { items: [{ img: '/old-gallery.jpg' }] }),
  block('telbar', { title: '联系' })
]
const empty: CaseView = {
  title: '当前案例',
  industry: '',
  client: '',
  location: '',
  area: '',
  year: '',
  system: '',
  systemNote: '',
  img: '',
  lead: '',
  chips: [],
  bgImage: '',
  body: '',
  bodyHtml: '',
  bodyBlocks: [],
  images: []
}

test('案例空字段不继承模板或旧页的首屏内容', () => {
  for (const old of [undefined, template]) {
    const hero = blockData(sync.buildCaseBlocks(empty, template, old), 'hero-dark')
    assert.deepEqual(hero, { h1: '当前案例', lead: '', chips: [], bgImage: '' })
  }
})

test('案例仅按当前记录派生头图、导语与标签，头部大图缺省复用卡片图片', () => {
  const item = { ...empty, img: '/card.jpg', area: '100㎡', industry: '工业', system: '体系' }
  assert.deepEqual(blockData(sync.buildCaseBlocks(item, template), 'hero-dark'), {
    h1: '当前案例',
    lead: '',
    chips: [],
    bgImage: '/card.jpg'
  })
  const filled = { ...item, lead: '导语', chips: ['标签'], bgImage: '/hero.jpg' }
  assert.deepEqual(blockData(sync.buildCaseBlocks(filled, template), 'hero-dark'), {
    h1: '当前案例',
    lead: '导语',
    chips: ['标签'],
    bgImage: '/hero.jpg'
  })
})

test('案例有信息但行业为空时不继承徽标', () => {
  const card = blockData(sync.buildCaseBlocks({ ...empty, client: '当前业主' }, template), 'glass-card')
  assert.equal(card.badge, '')
  assert.equal(card.title, '项目信息')
  assert.deepEqual(card.rows, [{ k: '业主', v: '当前业主' }])
})

test('案例历史画廊数据保留但不派生画廊与标题，空分区整体隐藏', () => {
  const item = { ...empty, images: [{ img: '/history.jpg', caption: '历史图片' }] }
  const before = structuredClone(item)
  const blocks = sync.buildCaseBlocks(item, template, template)
  assert.deepEqual(
    blocks.map((entry) => entry.key),
    ['hero-dark', 'telbar']
  )
  assert.deepEqual(item, before)
})

test('案例正文图片保留原位置，历史正文兼容且不继承模板HTML', () => {
  const html = '<p>前文</p><img src="/body.jpg"><p>后文</p>'
  const blocks = sync.buildCaseBlocks({ ...empty, bodyHtml: html }, template, template)
  assert.deepEqual(
    blocks.map((entry) => entry.key),
    ['hero-dark', 'section-head', 'article-body', 'telbar']
  )
  assert.deepEqual(blockData(blocks, 'article-body'), { html, blocks: [] })
  const legacy = blockData(sync.buildCaseBlocks({ ...empty, body: '历史正文' }, template), 'article-body')
  assert.equal(legacy.html, '')
  assert.deepEqual(legacy.blocks, [{ kind: 'paragraph', text: '历史正文' }])
})

test('案例精简模板只在有信息时补信息卡，不补项目画面，重复派生ID稳定', () => {
  const minimal = [block('hero-dark'), block('article-body')]
  const first = sync.buildCaseBlocks({ ...empty, client: '业主' }, minimal)
  assert.deepEqual(
    first.map((entry) => entry.key),
    ['hero-dark', 'glass-card']
  )
  assert.equal(blockData(first, 'glass-card').title, '项目信息')
  assert.deepEqual(sync.buildCaseBlocks({ ...empty, client: '业主' }, minimal, first), first)
})

test('案例弹窗仅编辑整篇正文，不读取或提交历史images字段', () => {
  const source = readFileSync(resolve(__dirname, '../../../../admin/app/components/CaseDialog.vue'), 'utf8')
  assert.doesNotMatch(source, /ImageRow|\bimages\b|项目画面/)
  assert.match(source, /<NewsBodyEditor v-model="bodyHtml"/)
  assert.match(source, /bodyHtml: bodyHtml.value/)
})

test('产品与新闻维持原有模板继承和正文派生行为', () => {
  const product: ProductView = {
    name: '产品',
    cnName: '',
    series: '',
    desc: '说明',
    img: '',
    lead: '',
    chips: [],
    bgImage: '',
    tags: ['特性'],
    systemIntro: [],
    layers: [],
    features: [],
    colors: [],
    faqs: []
  }
  const hero = blockData(sync.buildProductBlocks(product, template), 'hero-dark')
  assert.equal(hero.bgImage, '/old.jpg')
  assert.equal(hero.lead, '说明')
  assert.deepEqual(hero.chips, ['特性'])
  assert.equal(hero.eyebrow, '旧行业')
  const news = new NewsFaqSyncService(null!, null!)
  const newsBlocks = news.buildArticleDetailBlocks(
    {
      title: '新闻',
      summary: '摘要',
      publishDate: '2026-11-05',
      paragraphs: [],
      bodyHtml: '<p>新闻正文</p>'
    },
    template
  )
  assert.equal(blockData(newsBlocks, 'hero-dark').bgImage, '/old.jpg')
  assert.equal(blockData(newsBlocks, 'article-body').html, '<p>新闻正文</p>')
})
