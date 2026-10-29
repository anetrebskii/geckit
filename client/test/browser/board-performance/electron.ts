import { SESSION_STATUSES } from '../../../src/shared/api'
import type { ChatSession, SessionItem } from '../../../src/shared/api'
import { fixture, ipcRenderer as boundary, source, sourceItems } from '../conversation-export/electron'

export { contextBridge, webUtils } from '../conversation-export/electron'
export { fixture, source, sourceItems }

const total = new URLSearchParams(location.search).has('large') ? 800 : 16
fixture.destinations = Array.from({ length: total }, (_, index): ChatSession => ({
  id: `board-${String(index)}`, root: source.root, title: `Board task ${String(index + 1)}`, at: source.at - index * 60_000,
  ...(index < 4 ? { status: 'todo' as const } : index < 8 ? {} : index < 12 ? { status: 'done' as const } : { status: 'archived' as const }),
  state: 'idle', mode: source.mode, here: true, stands: 'Synthetic board fixture', queued: [],
  ...(index === 1 ? { parent: 'board-0' } : {}),
}))

export function snapshot(): void {
  const all = structuredClone([source, ...fixture.destinations])
  for (const listener of fixture.subscriptions.get('chat:sessions') ?? []) listener(new Event('chat:sessions'), all)
}

export function stream(text: string): void {
  const item: SessionItem = { kind: 'theirs', id: 'streamed', text, phase: 'commentary' }
  for (const listener of fixture.subscriptions.get('chat:items') ?? []) listener(new Event('chat:items'), { id: source.id, items: [item] })
}

export function changeCard(): void {
  fixture.destinations = fixture.destinations.map((one) => one.id === 'board-0' ? { ...one, title: `${one.title}!` } : one)
  snapshot()
}

export const ipcRenderer = {
  ...boundary,
  invoke: async (...args: Parameters<typeof boundary.invoke>): ReturnType<typeof boundary.invoke> => {
    if (args[0] === 'chat:items' && args[1] !== source.id) return sourceItems.map((one) => one.kind === 'mine' ? { ...one, text: `First message for ${String(args[1])}` } : one)
    return boundary.invoke(...args)
  },
  send: (...[channel, ...values]: Parameters<typeof boundary.send>): void => {
    boundary.send(channel, ...values)
    const id = values[0]
    if (channel === 'chat:mark') {
      const status = SESSION_STATUSES.find((one) => one.status === values[1])?.status
      fixture.destinations = fixture.destinations.map((one) => {
        if (one.id !== id) return one
        const next = { ...one }
        if (status === undefined) delete next.status
        else next.status = status
        return next
      })
      snapshot()
    }
    if (channel === 'chat:rename') {
      fixture.destinations = fixture.destinations.map((one) => one.id === id ? { ...one, title: String(values[1]) } : one)
      snapshot()
    }
  },
}
