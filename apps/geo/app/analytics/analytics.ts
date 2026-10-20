/**
 * 埋点插件（仅客户端）—— **构建期条件注册**，不在 plugins/ 自动扫描目录内
 * 路由变化后通过 navigator.sendBeacon 上报，不阻塞页面、关闭页面也能送达；
 * 匿名 ID 本地生成不含个人信息；站点 ID 取自已加载的站点配置
 *
 * 启用条件：env 置 `NUXT_PUBLIC_TRACK_ENABLED=1` 时由 nuxt.config 的 plugins 数组注册。
 * 默认不注册——埋点代码完全不进入构建产物（而非"注入了但不执行"）。
 */
import { useApiBase } from '../utils/api-base'
import { usePreview } from '../composables/usePreview'

export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  const apiBase = useApiBase()

  /**
   * 预览态关闭埋点（09 §7.5）：
   * 编辑在 iframe 里反复预览草稿，若照常上报会把草稿浏览灌进站点统计，污染真实流量。
   */
  if (usePreview().isPreview) return

  function anonId(): string {
    let id = localStorage.getItem('geo_anon_id')
    if (!id) {
      id = `a_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem('geo_anon_id', id)
    }
    return id
  }

  function report(fullPath: string) {
    const site = useState<{ id: string } | null>('geo-site', () => null)
    if (!site.value?.id) return

    const payload = {
      siteId: site.value.id,
      path: fullPath,
      referrer: document.referrer || '',
      anonId: anonId()
    }

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    navigator.sendBeacon(`${apiBase}/track/collect`, blob)
  }

  const router = useRouter()
  router.afterEach((to) => {
    /** 等站点配置就绪后再上报，避免首屏拿不到 siteId */
    setTimeout(() => report(to.fullPath), 300)
  })
})
