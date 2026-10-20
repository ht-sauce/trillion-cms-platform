import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const rows = await p.blockDefinition.findMany({ where: { siteId: '0' } })
rows.sort((a, b) => a.key.localeCompare(b.key))
console.log('count =', rows.length)
for (const r of rows) {
  console.log(
    `${r.key.padEnd(18)} v${String(r.version).padEnd(3)} hero-in=${(r.code.match(/hero-in/g) || []).length} sec-head=${(r.code.match(/sec-head/g) || []).length} ADR036=${(r.code.match(/ADR-036/g) || []).length}`
  )
}
await p.$disconnect()
