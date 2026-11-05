import { expect, it, vi } from 'vitest'
import { coreEvents } from '../src/core/events'
import type { ChatSession } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import { observation } from '../src/service/remote/gateway'
import type { ObservationRuntime } from '../src/service/remote/gateway'
import { remoteRef } from '../src/shared/remote/protocol'

vi.mock('../src/main/store', () => ({ getSettings: () => ({ projects: ['/srv/app', '/srv/private'], profiles: [{ projects: ['/srv/profile'] }] }) }))
const conversation: ChatSession = { id: 'same-id', root: '/srv/app', title: 'Server conversation', stands: '', state: 'idle', at: 1, here: false, mode: 'manual' }
const manager: ChatSession = { ...conversation, id: 'manager-session', title: 'Manager' }
const runtime: ObservationRuntime = {
  subscribe: coreEvents().subscribe,
  sessions: { list: async () => [conversation], items: async () => Array.from({ length: 125 }, (_, index) => ({ id: String(index), kind: 'theirs', text: `message ${index}`, at: index })) },
  manager: { view: async () => ({ config: DEFAULT_MANAGER_CONFIG, state: 'off', workers: [], activity: [], providers: [], decisions: [], queued: 2, session: manager }), inspect: async (id) => ({ id, items: [{ id: 'manager-item', kind: 'theirs', text: 'Actual Manager history', at: 1 }] }) },
}

it('isolates identical IDs and paths on different hosts and paginates real runtime items', async () => {
  const first = observation(runtime, { id: 'server-a', name: 'A', publicKey: 'a' })
  const second = observation(runtime, { id: 'server-b', name: 'B', publicKey: 'b' })
  try {
    const a = await first.snapshot(['/srv/app'])
    const b = await second.snapshot(['/srv/app'])
    expect(a.projects[0]?.id).not.toBe(b.projects[0]?.id)
    expect(a.sessions[0]?.id).not.toBe(b.sessions[0]?.id)
    expect(a.projects.map((one) => one.path)).toEqual(['/srv/app'])
    await expect(second.history(['/srv/app'], a.sessions[0]?.id ?? '', 0)).rejects.toThrow('scope')
    const last = await first.history(['/srv/app'], remoteRef('server-a', 'session', conversation.id), 0)
    const earlier = await first.history(['/srv/app'], last.session, last.before)
    expect(last.items).toHaveLength(100)
    expect(earlier.items).toHaveLength(25)
    expect(new Set([...earlier.items, ...last.items].map((one) => one.id)).size).toBe(125)
  } finally { first.dispose(); second.dispose() }
})

it('includes the primary Manager conversation without extra threads only for explicit whole-server observation', async () => {
  const gateway = observation(runtime, { id: 'server', name: 'Server', publicKey: 'key' })
  const id = remoteRef('server', 'manager', manager.id)
  try {
    expect((await gateway.snapshot(['/srv/app'])).manager.threads).toEqual([])
    expect((await gateway.snapshot(['/srv/app'], true)).manager.threads).toEqual([])
    expect((await gateway.snapshot(['/srv/app', '/srv/private'], true)).manager.threads).toEqual([])
    const snapshot = await gateway.snapshot(['/srv/app', '/srv/private', '/srv/profile'], true)
    expect(snapshot.manager.threads).toEqual([{ id, title: 'Manager', state: 'idle' }])
    expect((await gateway.history(['/srv/app', '/srv/private', '/srv/profile'], id, 0, true)).items[0]?.text).toBe('Actual Manager history')
    await expect(gateway.history(['/srv/app'], id, 0, true)).rejects.toThrow('scope')
    await expect(gateway.history(['/srv/app', '/srv/private'], id, 0)).rejects.toThrow('scope')
  } finally { gateway.dispose() }
})
