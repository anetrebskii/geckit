import { providerOf } from '../../../shared/api'
import type { SessionProvider } from '../../../shared/api'
import type { ManagerView } from '../../../shared/manager'

export function managerAssistant(view: Pick<ManagerView, 'session' | 'config'>): SessionProvider {
  return view.session === undefined ? view.config.provider : providerOf(view.session.id)
}

export interface ManagerStand {
  /** Where Manager stands, said in full next to other things. */
  readonly label: string
  /** The same, next to the word Manager, where repeating it would read twice. */
  readonly short: string
  readonly tone: 'off' | 'ready' | 'working' | 'waiting' | 'paused' | 'error'
}

export function managerStand(view: ManagerView | undefined): ManagerStand {
  if (view === undefined) return { label: 'Set up Manager', short: 'Not set up', tone: 'off' }
  if (!view.config.enabled) return view.session === undefined ? { label: 'Set up Manager', short: 'Not set up', tone: 'off' } : { label: 'Manager disabled', short: 'Disabled', tone: 'off' }
  if (view.state === 'paused') return { label: 'Manager paused', short: 'Paused', tone: 'paused' }
  if (view.state === 'blocked') return { label: 'Manager unavailable', short: 'Unavailable', tone: 'error' }
  if (view.state === 'working' && view.session?.state === 'working' && view.session.retryNotice !== undefined) return { label: 'Waiting for Codex', short: 'Waiting for Codex', tone: 'waiting' }
  if (view.decisions.length > 0 || view.workers.some((one) => one.state === 'asks')) return { label: 'Needs your answer', short: 'Needs your answer', tone: 'waiting' }
  if (view.state === 'working') return { label: 'Coordinating', short: 'Coordinating', tone: 'working' }
  if (view.workers.some((one) => one.state === 'working')) return { label: 'Workers are working', short: 'Workers are working', tone: 'working' }
  return { label: 'Ready', short: 'Ready', tone: 'ready' }
}

export function managerLabel(view: ManagerView | undefined): string {
  return managerStand(view).label
}
