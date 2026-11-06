import { demandLoader } from '../../../../widget/loader'
import { demandWidget } from '../../../../widget/widget'

export default defineEventHandler((event) => {
  const asset = getRouterParam(event, 'asset')
  const entry = asset === 'loader.js' ? demandLoader : asset === 'widget.js' ? demandWidget : undefined
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  setHeader(event, 'Content-Type', 'text/javascript; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=300, must-revalidate')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return `;(${entry.toString()})();`
})
