import { observeAccess, recordAccess } from '../utils/access'

export default defineEventHandler((event) => {
  if (process.env.SITES_STATIC_DISABLED === '1') return
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase || '')
  const token = process.env.INTERNAL_API_TOKEN || ''
  const cidrs = (process.env.TRUSTED_PROXIES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  observeAccess(
    event.node.req,
    event.node.res,
    (info) => {
      recordAccess(info, { apiBase, token, send: (url, options) => $fetch(url, options) })
    },
    cidrs,
    String(config.public.siteSlug || '')
  )
})
