export function demandLoader() {
  type Widget = { open: (trigger: HTMLElement) => void }
  const scope = window as typeof window & {
    TrillionDemandLoader?: boolean
    TrillionDemandWidget?: (apiBase: string) => Promise<Widget>
  }
  const script = document.currentScript as HTMLScriptElement | null
  if (!script || scope.TrillionDemandLoader) return
  scope.TrillionDemandLoader = true
  let apiBase: string
  let widgetUrl: string
  try {
    const api = new URL(script.dataset.apiBase || '')
    if (!['https:', 'http:'].includes(api.protocol) || api.username || api.password) return
    if (
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(api.hostname) &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
    )
      api.hostname = window.location.hostname
    apiBase = api.href.replace(/\/$/, '')
    widgetUrl = new URL('widget.js', script.src).href
  } catch {
    return
  }
  let widget: Widget | undefined
  let preparing: Promise<void> | undefined
  function target(event: Event): HTMLAnchorElement | null {
    const element = event.target as Element | null
    const anchor = element?.closest?.('a[data-contact-action="demand"]') as HTMLAnchorElement | null
    if (
      !anchor ||
      anchor.closest('header, nav') ||
      anchor.hasAttribute('download') ||
      (anchor.target && anchor.target !== '_self')
    )
      return null
    try {
      const url = new URL(anchor.href, window.location.href)
      return url.origin === window.location.origin && /\/contact\/?$/.test(url.pathname) ? anchor : null
    } catch {
      return null
    }
  }
  function prepare() {
    if (widget || preparing) return
    preparing = (async () => {
      if (!scope.TrillionDemandWidget) {
        await new Promise<void>((resolve, reject) => {
          const body = document.createElement('script')
          body.src = widgetUrl
          body.async = true
          const timeout = window.setTimeout(() => {
            body.remove()
            reject(new Error('加载超时'))
          }, 10000)
          body.onload = () => {
            window.clearTimeout(timeout)
            body.remove()
            resolve()
          }
          body.onerror = () => {
            window.clearTimeout(timeout)
            body.remove()
            reject(new Error('加载失败'))
          }
          document.head.append(body)
        })
      }
      if (!scope.TrillionDemandWidget) throw new Error('组件不可用')
      widget = await scope.TrillionDemandWidget(apiBase)
    })()
      .catch(() => {})
      .finally(() => {
        preparing = undefined
      })
  }
  document.addEventListener('pointerover', (event) => {
    if (target(event)) prepare()
  })
  document.addEventListener('focusin', (event) => {
    if (target(event)) prepare()
  })
  document.addEventListener(
    'click',
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor = target(event)
      if (!anchor) return
      if (!widget) {
        prepare()
        return
      }
      try {
        widget.open(anchor)
        event.preventDefault()
        event.stopPropagation()
      } catch {
        return
      }
    },
    true
  )
}
