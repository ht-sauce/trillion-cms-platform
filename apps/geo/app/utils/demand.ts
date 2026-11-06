import { demandWidget } from '../../widget/widget'

type Demand = { open: (trigger: HTMLElement) => void }

let mounting: Promise<Demand> | undefined

export function mountDemand(apiBase: string, developmentSite?: string): Promise<Demand> {
  if (mounting) return mounting
  demandWidget()
  const scope = window as typeof window & {
    TrillionDemandWidget: (base: string, developmentSite?: string) => Promise<Demand>
  }
  mounting = scope.TrillionDemandWidget(apiBase, developmentSite).catch((error) => {
    mounting = undefined
    throw error
  })
  return mounting
}

export async function openDemand(trigger: EventTarget | null): Promise<void> {
  if (!mounting) throw new Error('需求组件尚未挂载')
  const demand = await mounting
  demand.open(trigger as HTMLElement)
}
