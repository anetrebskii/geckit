import { describe, expect, it } from 'vitest'

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
})
