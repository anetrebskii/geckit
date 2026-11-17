import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clientView, diffList, diffRows, findIn, rowsOf } from '../src/core/client-view'
import type { Can, ViewEvent, ViewSource } from '../src/core/client-view'
import type { SessionImage, SessionItem, SessionItems } from '../src/shared/api'

const theirs = (id: string, text: string): SessionItem => ({ kind: 'theirs', id, text })
const mine = (id: string, text: string): SessionItem => ({ kind: 'mine', id, text })
const OFFERED: readonly Can[] = ['deflate', 'pictures', 'steps', 'sessionsChanged', 'find']

function harness(items: (id: string) => Promise<SessionItem[]>, extra: Partial<ViewSource> = {}) {
  const sent: ViewEvent[] = []
  const source: ViewSource = { items, queuedPicture: () => Promise.resolve(undefined), ...extra }
  const view = clientView(source, OFFERED, (event) => sent.push(event))
  const told = (name: string): unknown[] => sent.flatMap((event) => (event.name === name ? [event.args[0]] : []))
  const tell = (name: string, value: unknown): boolean => view.event({ name, args: [value] })
  return { view, sent, told, tell }
}

describe('what a client is sent', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('folds runs of steps into one line and sends a run as it grows', async () => {
    const all: SessionItem[] = [mine('m1', 'Fix it'), { kind: 'did', id: 'd1', what: 'Read a.ts' }]
    const one = harness(() => Promise.resolve(all))
    await one.view.call('link:can', [['sessionsChanged', 'steps']])
    await one.view.call('chat:watch', [['s1']])
    const piece = await one.view.call('chat:turns', ['s1', 60])
    expect(piece).toEqual({ items: [all[0], { kind: 'steps', id: 'steps:d1', ids: ['d1'], latest: 'Read a.ts' }], left: 0 })
    one.tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd2', what: 'Ran npm test' }] })
    one.tell('chat:items', { id: 's1', items: [theirs('t1', 'Done')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toEqual([
      { id: 's1', items: [{ kind: 'steps', id: 'steps:d1', ids: ['d1', 'd2'], latest: 'Ran npm test' }, theirs('t1', 'Done')], gone: ['steps:d1'] },
    ])
    expect(await one.view.call('chat:steps', ['s1', ['d1', 'd2']])).toEqual([
      { kind: 'did', id: 'd1', what: 'Read a.ts' },
      { kind: 'did', id: 'd2', what: 'Ran npm test' },
    ])
  })

  it('sends the Manager with its steps whole, under its own name, while another conversation is open', async () => {
    const all: SessionItem[] = [mine('m1', 'What is running?'), { kind: 'did', id: 'd1', what: 'Ran geckit sessions list' }]
    const one = harness(() => Promise.resolve(all))
    await one.view.call('link:can', [['sessionsChanged', 'steps']])
    expect(await one.view.call('chat:turns', ['manager-1', 60, true])).toEqual({ items: all, left: 0 })
    await one.view.call('chat:watch', [['s1']])
    one.tell('manager:items', { id: 'manager-1', items: [theirs('t1', 'One is working.')] })
    one.tell('manager:items', { id: 'manager-2', items: [theirs('x', 'Not read here.')] })
    vi.advanceTimersByTime(100)
    expect(one.told('manager:items')).toEqual([{ id: 'manager-1', items: [theirs('t1', 'One is working.')] }])
    expect(one.told('chat:items')).toEqual([])
  })

  it('sends the end of a conversation, and what is before a line when asked', async () => {
    const all = Array.from({ length: 10 }, (_one, index) => theirs(`t${String(index)}`, 'x'))
    const one = harness(() => Promise.resolve(all))
    await one.view.call('link:can', [['steps']])
    expect(await one.view.call('chat:turns', ['s1', 3])).toEqual({ items: all.slice(7), left: 7 })
    expect(await one.view.call('chat:turnsBefore', ['s1', 't7', 4])).toEqual({ items: all.slice(3, 7), left: 3 })
    expect(await one.view.call('chat:turnsBefore', ['s1', 'unknown', 4])).toEqual({ items: [], left: 0 })
  })

  it('keeps every waiting card in the end however many there are', async () => {
    const cards: SessionItem[] = Array.from({ length: 4 }, (_one, index) => ({ kind: 'card', id: `q${String(index)}`, card: { kind: 'question', title: 'Which?' } }))
    const all: SessionItem[] = [...cards, theirs('a', 'one'), theirs('b', 'two')]
    const one = harness(() => Promise.resolve(all))
    await one.view.call('link:can', [['steps']])
    const piece = (await one.view.call('chat:turns', ['s1', 2])) as { readonly items: readonly SessionItem[] }
    expect(piece.items.map((item) => item.id)).toEqual(['q0', 'q1', 'q2', 'q3'])
  })

  it('sends what moved in the order it now has, from the first place it differs', async () => {
    const all: SessionItem[] = [mine('m1', 'Fix it'), theirs('growing:1', 'Look')]
    const one = harness(() => Promise.resolve(all))
    await one.view.call('link:can', [['sessionsChanged', 'steps']])
    await one.view.call('chat:turns', ['s1', 60])
    one.tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd1', what: 'Read a.ts' }] })
    one.tell('chat:items', { id: 's1', items: [theirs('t1', 'Looked')], gone: ['growing:1'] })
    vi.advanceTimersByTime(100)
    const page = new Map<string, SessionItem>(all.map((item) => [item.id, item]))
    for (const said of one.told('chat:items') as SessionItems[]) {
      for (const id of said.gone ?? []) page.delete(id)
      for (const item of said.items) page.set(item.id, item)
    }
    expect([...page.keys()]).toEqual(['m1', 'steps:d1', 't1'])
  })

  it('keeps a question received while the conversation is being read', async () => {
    const all: SessionItem[] = [theirs('t1', 'Choose how to continue')]
    const question: SessionItem = { kind: 'card', id: 'q1', card: { kind: 'question', title: 'Which option?', choices: ['First', 'Second'] } }
    let finish: (items: SessionItem[]) => void = () => undefined
    const one = harness(() => new Promise((resolve) => { finish = resolve }))
    await one.view.call('link:can', [['sessionsChanged', 'steps']])
    const turns = one.view.call('chat:turns', ['s1', 60])
    await Promise.resolve()
    await Promise.resolve()
    one.tell('chat:items', { id: 's1', items: [question] })
    vi.advanceTimersByTime(100)
    finish(all)
    expect(await turns).toEqual({ items: [...all, question], left: 0 })
    one.tell('chat:items', { id: 's1', items: [theirs('t2', 'Waiting for your answer')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toEqual([{ id: 's1', items: [theirs('t2', 'Waiting for your answer'), question], gone: ['q1'] }])
  })

  it('sends nothing of a conversation until the client has read its end, and nothing of one it does not have open', async () => {
    const one = harness(() => Promise.resolve([mine('m1', 'Fix it')]))
    await one.view.call('link:can', [['sessionsChanged', 'steps']])
    await one.view.call('chat:watch', [['s1']])
    one.tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd1', what: 'Read a.ts' }] })
    one.tell('chat:items', { id: 's2', items: [theirs('x', 'Elsewhere')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toEqual([])
    await one.view.call('chat:turns', ['s1', 60])
    one.tell('chat:items', { id: 's1', items: [theirs('t1', 'Done')] })
    one.tell('chat:items', { id: 's2', items: [theirs('y', 'Elsewhere again')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toEqual([{ id: 's1', items: [theirs('t1', 'Done')] }])
    await one.view.call('chat:watch', [[]])
    one.tell('chat:items', { id: 's1', items: [theirs('t2', 'After leaving')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toHaveLength(1)
  })

  it('sends a client from before it said what it can every update as it came', () => {
    const one = harness(() => Promise.resolve([]))
    one.tell('chat:items', { id: 's2', items: [theirs('x', 'Hi')] })
    vi.advanceTimersByTime(100)
    expect(one.told('chat:items')).toEqual([{ id: 's2', items: [theirs('x', 'Hi')] }])
  })

  it('sends the rows that changed to a client that can take them, and the whole list to one that cannot after it had time to say', async () => {
    const row = (id: string, at: number): unknown => ({ id, at, title: id })
    const newer = harness(() => Promise.resolve([]))
    const older = harness(() => Promise.resolve([]))
    await newer.view.call('link:can', [['sessionsChanged']])
    for (const one of [newer, older]) {
      one.tell('chat:sessions', [row('a', 2), row('b', 1)])
      vi.advanceTimersByTime(300)
      one.tell('chat:sessions', [row('b', 3), row('c', 0)])
      vi.advanceTimersByTime(300)
      one.tell('chat:sessions', [row('b', 3), row('c', 0)])
      vi.advanceTimersByTime(300)
    }
    expect(newer.told('chat:sessions')).toEqual([[row('a', 2), row('b', 1)]])
    expect(newer.told('chat:sessionsChanged')).toEqual([{ changed: [row('b', 3), row('c', 0)], gone: ['a'] }])
    expect(older.told('chat:sessions')).toEqual([])
    vi.advanceTimersByTime(10_000)
    expect(older.told('chat:sessions')).toEqual([[row('b', 3), row('c', 0)]])
    older.tell('chat:sessions', [row('c', 4)])
    vi.advanceTimersByTime(300)
    expect(older.told('chat:sessions')).toHaveLength(2)
  })

  it('sends pictures by name, and a picture at the width asked for when asked', async () => {
    const picture: SessionImage = { media: 'image/png', data: 'AAAA' }
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Look', images: [picture] }]
    const scale = vi.fn((image: SessionImage, width: number) => Promise.resolve({ ...image, data: `w${String(width)}` }))
    const one = harness(() => Promise.resolve(all), { scale })
    await one.view.call('link:can', [['steps', 'pictures']])
    const ref = 's1\nm1\n0'
    expect(await one.view.call('chat:turns', ['s1', 60])).toEqual({ items: [{ kind: 'mine', id: 'm1', text: 'Look', images: [{ media: 'image/png', data: '', ref }] }], left: 0 })
    expect(await one.view.call('chat:picture', [ref, 660])).toEqual({ media: 'image/png', data: 'w660' })
    await one.view.call('chat:picture', [ref, 660])
    expect(scale).toHaveBeenCalledTimes(1)
    expect(await one.view.call('chat:picture', ['s1\nnone\n0', 660])).toBeNull()
  })

  it('sends the picture itself where nothing can scale it', async () => {
    const picture: SessionImage = { media: 'image/png', data: 'AAAA' }
    const one = harness(() => Promise.resolve([{ kind: 'mine', id: 'm1', text: 'Look', images: [picture] }]))
    await one.view.call('link:can', [['pictures']])
    expect(await one.view.call('chat:picture', ['s1\nm1\n0', 660])).toEqual(picture)
  })

  it('refuses a conversation outside the device scope', async () => {
    const one = harness(() => Promise.resolve([]), { allowed: (id) => id === 's1' })
    await one.view.call('link:can', [['steps']])
    await expect(one.view.call('chat:turns', ['s2', 60])).rejects.toThrow('Conversation is outside this device scope.')
    await expect(one.view.call('chat:find', ['s2', 'x'])).rejects.toThrow('outside this device scope')
    await expect(one.view.call('chat:picture', ['s2\nm1\n0', 100])).rejects.toThrow('outside this device scope')
  })

  it('answers only what it owns', () => {
    const one = harness(() => Promise.resolve([]))
    expect(one.view.call('chat:send', [])).toBeUndefined()
    expect(one.tell('settings:changed', {})).toBe(false)
  })

  it('offers only what it was given', async () => {
    const one = harness(() => Promise.resolve([]))
    expect(await one.view.call('link:can', [['steps', 'teleport']])).toEqual({ can: ['steps'] })
  })
})

describe('the pure parts', () => {
  it('finds the messages holding the words, oldest first, whatever the case', () => {
    const all: SessionItem[] = [mine('m1', 'Fix the Login'), { kind: 'did', id: 'd1', what: 'login.ts' }, theirs('t1', 'Login fixed'), theirs('t2', 'Done')]
    expect(findIn(all, ' login ')).toEqual({ total: 2, hits: ['m1', 't1'] })
    expect(findIn(all, '')).toEqual({ total: 0, hits: [] })
  })

  it('diffs rows from the first place they differ', () => {
    const before = rowsOf([theirs('a', '1'), theirs('b', '2')])
    const after = rowsOf([theirs('a', '1'), theirs('c', '3'), theirs('b', '2')])
    expect(diffRows(before, after)).toEqual({ gone: ['b'], items: [theirs('c', '3'), theirs('b', '2')] })
    expect(diffRows(after, after)).toEqual({ gone: [], items: [] })
  })

  it('diffs a list by row', () => {
    const row = { id: 'a', at: 1, title: 'a' } as never
    const { change, rows } = diffList(new Map(), [row])
    expect(change).toEqual({ changed: [row], gone: [] })
    expect(diffList(rows, []).change).toEqual({ changed: [], gone: ['a'] })
  })
})
