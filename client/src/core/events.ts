import type { ChatSession, ClaudeAccount, GitState, Lineup, PlaceUsage, PlanUsage, SessionItems, SessionNotice, SpeechModel, Settings } from '../shared/api'
import type { Employees } from '../main/employees'
import type { HostCheck, HostPrompt, HostView } from '../shared/hosts'
import type { ManagerView } from '../shared/manager'
import type { TelegramView } from '../shared/telegram'
import type { ChannelsView } from '../shared/channels'
import type { Shares } from '../main/shares'
import type { RpcEvent } from './rpc'

export interface CoreEvents {
  'chat:sessions': (sessions: readonly ChatSession[]) => void
  'chat:items': (items: SessionItems) => void
  'chat:accountChanged': (account: ClaudeAccount) => void
  'chat:show': (id: string) => void
  'chat:plan': (plan: PlanUsage) => void
  'chat:git': (git: Pick<ChatSession, 'root'> & { readonly state: GitState | undefined }) => void
  'chat:plans': (plans: readonly PlaceUsage[]) => void
  'chat:notice': (notice: SessionNotice) => void
  'lineup:changed': (lineup: Lineup) => void
  'employees:changed': (view: ReturnType<Employees['list']>) => void
  'settings:changed': (settings: Settings) => void
  'hosts:changed': (hosts: readonly HostView[]) => void
  'hosts:prompt': (prompt: HostPrompt) => void
  'hosts:answered': (id: string) => void
  'hosts:checks': (checks: readonly HostCheck[]) => void
  'manager:view': (view: ManagerView) => void
  'manager:items': (items: SessionItems) => void
  'telegram:view': (view: TelegramView) => void
  'channels:changed': (view: ChannelsView) => void
  'peer:shares': (shares: ReturnType<Shares['rooms']>) => void
  'speech:model': (model: SpeechModel) => void
  'core:terminal': (root: string, command: string, status?: string) => void
}

export type CoreEvent = RpcEvent<CoreEvents>

export function coreEvents() {
  const listeners = new Set<(event: CoreEvent) => void>()
  return {
    subscribe(listener: (event: CoreEvent) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit<K extends keyof CoreEvents>(name: K, ...args: Parameters<CoreEvents[K]>): void {
      const event = { name, args } as CoreEvent
      for (const listener of listeners) listener(event)
    },
  }
}
