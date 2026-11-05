import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CasesService } from './cases.service'
import type { PrismaService } from '../../prisma/prisma.service'
import type { AuthUser } from '../../common/decorators/current-user.decorator'

test('案例保存将正文 HTML 原样入库，不改写标签、属性、媒体 URL 与排版（ADR-061）', async () => {
  let saved: Record<string, unknown> = {}
  const row = { id: 'case', siteId: 'site', bodyHtml: '', body: '', bodyBlocks: [], images: [], chips: [] }
  const prisma = {
    caseStudy: {
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        saved = data
      }
    }
  } as unknown as PrismaService
  const service = new CasesService(prisma, null!, null!, null!)
  Object.assign(service, { deriveDetailPage: async () => 'page', syncAndPublish: async () => [] })
  const html =
    '<p style="text-align:center;line-height:1.6em"><img src="http://127.0.0.1:3001/static/a.jpg?a=1&amp;b=2" width="535" height="402">' +
    '<img src="http://localhost:3002/assets/a.jpg"><img src="https://cdn.example.com/static/b.jpg">' +
    '<video poster="http://[::1]:3001/static/p.jpg"><source src="http://localhost:3001/static/v.mp4"></video></p>'
  await service.updateCase({ platform: true } as AuthUser, row.id, { bodyHtml: html })
  assert.equal(saved.bodyHtml, html)
})
