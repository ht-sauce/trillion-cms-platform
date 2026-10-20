import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const site = await p.site.findFirst({ where: { slug: 'xian-renai-skin' } })
console.log('site =', site?.id, site?.slug)
const rows = await p.blockDefinition.findMany({ where: { siteId: site.id }, orderBy: { key: 'asc' } })
console.log('site-private block copies =', rows.length)
for (const r of rows) {
  console.log(
    `${r.key.padEnd(18)} v${String(r.version).padEnd(3)} ADR036=${(r.code.match(/ADR-036/g) || []).length} hero-in=${(r.code.match(/hero-in/g) || []).length}`
  )
}
await p.$disconnect()
