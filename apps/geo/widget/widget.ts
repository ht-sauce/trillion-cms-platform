export function demandWidget() {
  const scope = window as typeof window & {
    TrillionDemandWidget?: (
      apiBase: string,
      developmentSite?: string
    ) => Promise<{ open: (trigger: HTMLElement) => void }>
  }
  scope.TrillionDemandWidget = async (apiBase, developmentSite) => {
    async function request<T>(url: string, body?: Record<string, string>): Promise<T> {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'origin',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(developmentSite ? { 'X-Development-Site': developmentSite } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      })
      const result = await response.json()
      if (!response.ok || result.code !== 0) {
        const error = new Error(
          Array.isArray(result.message) ? result.message.join('；') : result.message || '请求失败'
        ) as Error & { business: boolean }
        error.business = true
        throw error
      }
      return result.data as T
    }
    const config = await request<{
      version: number
      widgetKey: string
      siteName: string
      captchaPath: string
      submitPath: string
    }>(`${apiBase}/demands/widget-config`)
    if (config.version !== 1 || !config.widgetKey) throw new Error('配置不可用')
    function endpoint(path: string) {
      const url = new URL(path, apiBase)
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        url.origin !== new URL(apiBase).origin ||
        url.search ||
        url.hash
      )
        throw new Error('接口地址不可用')
      return url.href
    }
    const captchaUrl = endpoint(config.captchaPath)
    const submitUrl = endpoint(config.submitPath)
    const host = document.createElement('div')
    host.dataset.demandWidget = 'v1'
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}dialog{font:13px/1.5 system-ui,sans-serif;color:#243047;background:#fff;border:0;border-radius:12px;padding:0;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 32px);box-shadow:0 16px 64px #0004}dialog::backdrop{background:#0006}header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid #dbe2ed}h2{font-size:16px;margin:0}.body{padding:12px;overflow:auto;max-height:calc(100dvh - 96px)}p{margin:0 0 8px}.welcome{background:#eef4ff;border-radius:8px;padding:8px}label{display:block;margin:4px 0 2px}input,textarea,button{font:inherit}input,textarea{width:100%;padding:6px 8px;border:1px solid #bac5d6;border-radius:8px;background:#fff;color:inherit}textarea{resize:vertical;min-height:64px}button{cursor:pointer;border:1px solid #bac5d6;border-radius:8px;padding:6px 10px;background:#fff;color:inherit}button:disabled{cursor:wait;opacity:.6}:focus-visible{outline:2px solid #2563eb;outline-offset:2px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px}fieldset{border:0;padding:0;margin:8px 0;min-width:0}legend{padding:0}.captcha{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.captcha img{width:160px;height:52px}.save{width:100%;background:#2563eb;color:#fff;border:0;margin-top:4px}.status{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;color:#a52a2a}.status:empty{display:none}.success{color:#16703c}.hint{font-size:12px;color:#56647a;margin:4px 0} @media(max-width:380px){.grid{grid-template-columns:1fr}}
      </style><dialog aria-labelledby="demand-title"><header><h2 id="demand-title">需求咨询</h2><button type="button" data-close aria-label="关闭需求窗口">关闭</button></header><div class="body"><p class="welcome">您好！请描述您的需求，并留下任意一种联系方式，我们会在站外与您联系。</p><form><label for="description">需求描述（必填）</label><textarea id="description" name="description" required minlength="2" maxlength="5000"></textarea><label for="contactName">称呼（选填）</label><input id="contactName" name="contactName" maxlength="64" autocomplete="name"><fieldset><legend>联系方式（至少填写一项）</legend><div class="grid"><div><label for="phone">手机号</label><input id="phone" name="phone" type="tel" maxlength="32" autocomplete="tel"></div><div><label for="wechat">微信</label><input id="wechat" name="wechat" maxlength="64"></div><div><label for="email">邮箱</label><input id="email" name="email" type="email" maxlength="128" autocomplete="email"></div><div><label for="otherContact">其他联系方式</label><input id="otherContact" name="otherContact" maxlength="255"></div></div></fieldset><label for="captchaCode">图片验证码（必填）</label><div class="captcha"><img alt="图片验证码" hidden><button type="button" data-refresh>刷新验证码</button></div><input id="captchaCode" name="captchaCode" required maxlength="16" autocomplete="off"><p class="hint">验证码 5 分钟有效。联系方式仅用于本次需求跟进。</p><button class="save" type="submit">提交需求</button></form><p class="status" role="status" aria-live="polite"></p></div></dialog>`
    const dialog = root.querySelector('dialog')!
    const form = root.querySelector('form')!
    const image = root.querySelector('img')!
    const refresh = root.querySelector<HTMLButtonElement>('[data-refresh]')!
    const status = root.querySelector<HTMLElement>('.status')!
    const welcome = root.querySelector<HTMLElement>('.welcome')!
    const description = root.querySelector<HTMLTextAreaElement>('#description')!
    const code = root.querySelector<HTMLInputElement>('#captchaCode')!
    let captchaId = ''
    let busy = false
    let captchaBusy = false
    let trigger: HTMLElement | undefined
    let attempt: { fingerprint: string; body: Record<string, string> } | undefined
    let uncertain = false
    let lastSubmit = 0
    function message(text: string) {
      status.textContent = text
    }
    function lock() {
      for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
        'input, textarea, button'
      ))
        control.disabled = busy
      refresh.disabled = busy || captchaBusy
      form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = busy || captchaBusy
    }
    async function getCaptcha() {
      if (busy || captchaBusy) return
      captchaBusy = true
      lock()
      try {
        const challenge = await request<{ id: string; image: string }>(captchaUrl)
        if (!challenge.id || !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(challenge.image))
          throw new Error('验证码格式不可用')
        captchaId = challenge.id
        image.src = challenge.image
        image.hidden = false
        code.value = ''
        message('')
      } catch (error) {
        message(error instanceof Error ? error.message : '验证码加载失败，请刷新重试')
      } finally {
        captchaBusy = false
        lock()
      }
    }
    refresh.addEventListener('click', () => {
      uncertain = false
      void getCaptcha()
    })
    form.addEventListener('input', () => {
      uncertain = false
    })
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (busy || captchaBusy || Date.now() - lastSubmit < 400) return
      if (!form.reportValidity()) return
      const body: Record<string, string> = {}
      for (const key of ['description', 'contactName', 'phone', 'wechat', 'email', 'otherContact']) {
        const value = (form.elements.namedItem(key) as HTMLInputElement).value.trim()
        if (value) body[key] = value
      }
      if (!body.description || body.description.length < 2) {
        message('请填写至少两个字的需求描述')
        description.focus()
        return
      }
      if (!['phone', 'wechat', 'email', 'otherContact'].some((key) => body[key])) {
        message('请至少填写一种联系方式')
        root.querySelector<HTMLInputElement>('#phone')!.focus()
        return
      }
      if (!captchaId || !code.value.trim()) {
        message('请获取并填写图片验证码')
        return
      }
      body.sourceUrl = `${window.location.origin}${window.location.pathname}`.slice(0, 512)
      const fingerprint = JSON.stringify(body)
      if (!attempt || attempt.fingerprint !== fingerprint)
        attempt = { fingerprint, body: { ...body, submitKey: crypto.randomUUID() } }
      if (!uncertain)
        attempt.body = { ...body, submitKey: attempt.body.submitKey, captchaId, captchaCode: code.value.trim() }
      busy = true
      lastSubmit = Date.now()
      lock()
      message('正在提交需求…')
      try {
        const result = await request<{ id: string }>(submitUrl, attempt.body)
        if (!result?.id) throw new Error('保存结果不明确，请重试')
        form.reset()
        form.hidden = true
        welcome.hidden = true
        status.classList.add('success')
        message('已收到您的需求，我们会尽快与您联系')
        attempt = undefined
        uncertain = false
        captchaId = ''
        image.hidden = true
      } catch (error) {
        uncertain = !(error as Error & { business?: boolean }).business
        message(
          uncertain
            ? '网络异常，保存结果尚未确认。请直接重试；修改内容将作为新的需求。'
            : error instanceof Error
              ? error.message
              : '保存失败，请重试'
        )
      } finally {
        busy = false
        lock()
      }
    })
    function close() {
      dialog.close()
      trigger?.focus()
    }
    root.querySelector('[data-close]')!.addEventListener('click', close)
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close()
    })
    dialog.addEventListener('close', () => {
      trigger?.focus()
    })
    document.body.append(host)
    return {
      open(element: HTMLElement) {
        trigger = element
        if (!dialog.open) dialog.showModal()
        if (form.hidden) {
          form.hidden = false
          welcome.hidden = false
          status.classList.remove('success')
          message('')
        }
        description.focus()
        if (!captchaId) void getCaptcha()
      }
    }
  }
}
