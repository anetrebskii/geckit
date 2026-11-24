import { describe, expect, it, vi } from 'vitest'

import { clientData } from '../src/shared/client-data'
import type { ChatSession, SessionItem, SessionItems } from '../src/shared/api'

const said = (id: string, text: string): SessionItem => ({ id, kind: 'theirs', text }) as SessionItem
const row = (id: string, at: number): ChatSession => ({ id, at, title: id }) as ChatSession

function link(answers: Record<string, (...args: unknown[]) => unknown>) {
  const calls: { readonly name: string; readonly args: unknown[] }[] = []
  const ears = new Map<string, (value: never) => void>()
  const kept = new Map<string, unknown>()
  const data = (keeping: boolean) => clientData({
    call: async <T,>(name: string, ...args: unknown[]): Promise<T> => {
      calls.push({ name, args })
      const answer = answers[name]
      if (answer === undefined) throw new Error(`Unknown GeckIt method: ${name}`)
      return answer(...args) as T
    },
    hear: (channel, heard) => { ears.set(channel, heard); return () => ears.delete(channel) },
    ...(keeping ? { keeps: { prefix: 'server:one', read: async <T,>(key: string) => kept.get(key) as T | undefined, keep: async (key: string, value: unknown) => { kept.set(key, value) } } } : {}),
  })
  const tell = (channel: string, value: unknown): void => ears.get(channel)?.(value as never)
  return { calls, data, tell, kept }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 10))

describe('client data', () => {
  it('reads the end of a conversation, then what is before it, from a side that pages', async () => {
    const side = link({
      'link:can': () => ({ can: ['steps', 'find'] }),
      'chat:watch': () => undefined,
      'chat:turns': () => ({ items: [said('c', 'three')], left: 2 }),
      'chat:turnsBefore': () => ({ items: [said('a', 'one'), said('b', 'two')], left: 0 }),
    })
    const data = side.data(false)
    const earlier: unknown[] = []
    data.listen('chat:earlier', (value) => earlier.push(value))
    expect(await data.items('s')).toEqual([said('c', 'three')])
    await settle()
    expect(earlier).toEqual([{ id: 's', left: 2 }])
    expect((await data.before('s', 'c')).items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(side.calls.map((one) => one.name)).toEqual(['link:can', 'chat:watch', 'chat:turns', 'chat:turnsBefore'])
    expect(side.calls.some((one) => one.name === 'chat:items')).toBe(false)
  })

  it('folds a whole conversation itself for a side from before pages', async () => {
    const all = Array.from({ length: 100 }, (_one, index) => said(`t${String(index)}`, String(index)))
    const side = link({ 'chat:items': () => all })
    const data = side.data(false)
    const end = await data.items('s')
    expect(end).toHaveLength(60)
    expect(end.at(-1)?.id).toBe('t99')
    expect(await data.find('s', 'x')).toBeUndefined()
  })

  it('tells only the conversation on screen, and the list as rows that changed', async () => {
    const side = link({
      'link:can': () => ({ can: ['sessionsChanged'] }),
      'chat:watch': () => undefined,
      'chat:turns': () => ({ items: [said('a', 'one')], left: 0 }),
      'chat:list': () => [row('one', 1), row('two', 2)],
    })
    const data = side.data(false)
    const items: SessionItems[] = []
    const lists: (readonly ChatSession[])[] = []
    data.listen('chat:items', (value: SessionItems) => items.push(value))
    data.listen('chat:sessions', (value: readonly ChatSession[]) => lists.push(value))
    await data.items('s')
    side.tell('chat:items', { id: 'other', items: [said('x', 'no')] })
    side.tell('chat:items', { id: 's', items: [said('b', 'two')] })
    await settle()
    expect(items.map((one) => one.id)).toEqual(['s'])
    await data.list(undefined)
    side.tell('chat:sessionsChanged', { changed: [row('three', 3)], gone: ['one'] })
    expect(lists.at(-1)?.map((one) => one.id)).toEqual(['three', 'two'])
  })

  it('opens on what it kept, then brings it up to date', async () => {
    const side = link({
      'link:can': () => ({ can: ['steps'] }),
      'chat:watch': () => undefined,
      'chat:turns': () => ({ items: [said('a', 'one'), said('b', 'two')], left: 0 }),
    })
    side.kept.set('server:one:items2:s', { items: [said('a', 'one')], left: 0 })
    const data = side.data(true)
    const items: SessionItems[] = []
    data.listen('chat:items', (value: SessionItems) => items.push(value))
    expect(await data.items('s')).toEqual([said('a', 'one')])
    await settle()
    expect(items.at(-1)?.items.map((one) => one.id)).toEqual(['a', 'b'])
  })

  it('keeps a failed step run collapsed in live updates and lets the next request open it', async () => {
    const first: SessionItem = { kind: 'did', id: 'one', what: 'Read the config' }
    const second: SessionItem = { kind: 'did', id: 'two', what: 'Ran the checks' }
    const run: SessionItem = { kind: 'steps', id: 'steps:one', ids: [first.id], latest: first.what }
    const grown: SessionItem = { ...run, ids: [first.id, second.id], latest: second.what }
    let tries = 0
    const side = link({
      'link:can': () => ({ can: ['steps'] }),
      'chat:watch': () => undefined,
      'chat:turns': () => ({ items: [run], left: 0 }),
      'chat:steps': () => {
        if (++tries === 1) throw new Error('Connection lost')
        if (tries === 2) return []
        return [first, second]
      },
    })
    const data = side.data(false)
    const updates: SessionItems[] = []
    data.listen('chat:items', (value: SessionItems) => updates.push(value))
    await data.items('s')
    await expect(data.steps('s', run.ids)).rejects.toThrow('Connection lost')
    side.tell('chat:items', { id: 's', items: [grown], gone: [run.id] })
    await settle()
    expect(updates.at(-1)).toEqual({ id: 's', items: [grown], gone: [run.id] })
    expect(tries).toBe(1)
    await expect(data.steps('s', grown.ids)).rejects.toThrow('No steps returned')
    await expect(data.steps('s', grown.ids)).resolves.toEqual([first, second])
  })

  it('refreshes an open chat after a transient transcript error on reconnect', async () => {
    const cached = said('cached', 'What the phone had before reconnecting')
    const fresh = said('fresh', 'New reply from the computer')
    let fetches = 0
    const side = link({
      'link:can': () => ({ can: ['steps'] }),
      'chat:watch': () => undefined,
      'chat:list': () => [],
      'chat:turns': () => {
        if (++fetches === 2) throw new Error('GeckIt on the server is busy. Try again in a moment.')
        return { items: fetches === 1 ? [cached] : [cached, fresh], left: 0 }
      },
    })
    const data = side.data(false)
    const updates: SessionItems[] = []
    data.listen('chat:items', (value: SessionItems) => updates.push(value))
    expect(await data.items('s')).toEqual([cached])
    data.reconnected()
    await settle()
    expect(updates.at(-1)?.items).toEqual([cached, fresh])
  })

  it('updates the transcript on reconnect even when new details for an open step run are unavailable', async () => {
    const earlier = said('earlier', 'An earlier reply')
    const first: SessionItem = { kind: 'did', id: 'one', what: 'Read the config' }
    const run: SessionItem = { kind: 'steps', id: 'steps:one', ids: [first.id] }
    const grown: SessionItem = { ...run, ids: [first.id, 'two'] }
    const fresh = said('fresh', 'New reply from the computer')
    let reconnecting = false
    const side = link({
      'link:can': () => ({ can: ['steps'] }),
      'chat:watch': () => undefined,
      'chat:list': () => [],
      'chat:turns': () => ({ items: reconnecting ? [grown, fresh] : [run], left: 0 }),
      'chat:turnsBefore': () => ({ items: [earlier], left: 0 }),
      'chat:steps': () => {
        if (reconnecting) throw new Error('Step details unavailable')
        return [first]
      },
    })
    const data = side.data(false)
    const updates: SessionItems[] = []
    data.listen('chat:items', (value: SessionItems) => updates.push(value))
    await data.items('s')
    await data.before('s', run.id)
    await data.steps('s', run.ids)
    reconnecting = true
    data.reconnected()
    await settle()
    expect(updates.at(-1)?.items).toEqual([grown, fresh])
    expect(updates.at(-1)?.gone).toContain(first.id)
    expect(updates.at(-1)?.gone).not.toContain(earlier.id)
  })

  it('delivers new updates without waiting for a step request from before reconnecting', async () => {
    const first: SessionItem = { kind: 'did', id: 'one', what: 'Read the config' }
    const run: SessionItem = { kind: 'steps', id: 'steps:one', ids: [first.id] }
    const grown: SessionItem = { ...run, ids: [first.id, 'two'] }
    const fresh = said('fresh', 'New reply from the computer')
    let items: SessionItem[] = [run]
    let finish: ((steps: SessionItem[]) => void) | undefined
    const pending = new Promise<SessionItem[]>((resolve) => { finish = resolve })
    const side = link({
      'link:can': () => ({ can: ['steps'] }),
      'chat:watch': () => undefined,
      'chat:list': () => [],
      'chat:turns': () => ({ items, left: 0 }),
      'chat:steps': () => items.includes(grown) ? pending : [first],
    })
    const data = side.data(false)
    const updates: SessionItems[] = []
    data.listen('chat:items', (value: SessionItems) => updates.push(value))
    await data.items('s')
    await data.steps('s', run.ids)
    items = [grown]
    side.tell('chat:items', { id: 's', items, gone: [run.id] })
    await settle()
    expect(updates).toHaveLength(0)
    data.reconnected()
    await settle()
    side.tell('chat:items', { id: 's', items: [fresh] })
    await settle()
    expect(updates.map((update) => update.items)).toEqual([[grown], [fresh]])
    finish?.([first])
    await settle()
    expect(updates).toHaveLength(2)
  })

  it('keeps showing new replies while a live step lookup stalls on a connected link', async () => {
    vi.useFakeTimers()
    try {
      const first: SessionItem = { kind: 'did', id: 'one', what: 'Read the config' }
      const run: SessionItem = { kind: 'steps', id: 'steps:one', ids: [first.id] }
      const grown: SessionItem = { ...run, ids: [first.id, 'two'] }
      const fresh = said('fresh', 'New reply from the computer')
      const side = link({
        'link:can': () => ({ can: ['steps'] }),
        'chat:watch': () => undefined,
        'chat:turns': () => ({ items: [run], left: 0 }),
        'chat:steps': (_id, ids) => Array.isArray(ids) && ids.length === 1 && ids[0] === first.id
          ? [first]
          : new Promise<SessionItem[]>(() => undefined),
      })
      const data = side.data(false)
      const updates: SessionItems[] = []
      data.listen('chat:items', (value: SessionItems) => updates.push(value))
      await data.items('s')
      await data.steps('s', run.ids)
      side.tell('chat:items', { id: 's', gone: [run.id], items: [grown] })
      side.tell('chat:items', { id: 's', items: [fresh] })
      await vi.advanceTimersByTimeAsync(2_000)
      expect(updates.map((update) => update.items)).toEqual([[grown], [fresh]])
    } finally {
      vi.useRealTimers()
    }
  })
})
