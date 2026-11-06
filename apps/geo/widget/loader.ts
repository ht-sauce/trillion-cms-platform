export function demandLoader() {
  type Widget = { open: (trigger: HTMLElement) => void }
  const scope = window as typeof window & {
    TrillionDemand?: { mountDemand: () => Promise<void>; openDemand: (trigger: HTMLElement) => Promise<void> }
    TrillionDemandWidget?: (apiBase: string) => Promise<Widget>
  }
  const script = document.currentScript as HTMLScriptElement | null
  if (!script || scope.TrillionDemand) return
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
  function prepare() {
    if (widget) return Promise.resolve()
    if (preparing) return preparing
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
    })().finally(() => {
      preparing = undefined
    })
    return preparing
  }
  scope.TrillionDemand = {
    mountDemand: prepare,
    async openDemand(trigger) {
      await prepare()
      widget!.open(trigger)
    }
  }
  void prepare().catch(() => {})
}
