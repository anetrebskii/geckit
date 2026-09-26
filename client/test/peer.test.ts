import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Link } from '../src/renderer/src/link'
import type { LinkMessage } from '../src/shared/pairing'
import type { SessionItem, SessionItems } from '../src/shared/api'

let joined: (link: Link) => void = () => undefined
vi.mock('../src/renderer/src/link', () => ({
  listen: (_pairing: unknown, join: (link: Link) => void) => {
    joined = join
    return () => undefined
  },
}))

interface Phone {
  readonly link: Link
  readonly sent: LinkMessage[]
  readonly say: (message: LinkMessage) => void
}

function phone(): Phone {
  const sent: LinkMessage[] = []
  const hearers: ((message: LinkMessage) => void)[] = []
  const link: Link = {
    send: (message) => sent.push(message),
    onMessage: (heard) => hearers.push(heard),
    onClose: () => undefined,
    close: () => undefined,
    screen: () => undefined,
    share: () => Promise.resolve(),
    compress: () => undefined,
  }
  return { link, sent, say: (message) => hearers.forEach((hear) => hear(message)) }
}

const theirs = (id: string, text: string): SessionItem => ({ kind: 'theirs', id, text })
const told = (one: Phone, channel: string): unknown[] =>
  one.sent.flatMap((message) => (message.t === 'tell' && message.channel === channel ? [message.value] : []))

describe('what the peer window tells phones', () => {
  let tell: (channel: string, value: unknown) => void = () => undefined

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.stubGlobal('window', {
      setTimeout,
      geckit: {
        peer: {
          state: () => undefined,
          call: () => Promise.resolve(null),
          onTell: (said: (channel: string, value: unknown) => void) => {
            tell = said
          },
          pairing: () => Promise.resolve({ key: 'k', signal: 's' }),
        },
      },
    })
    await import('../src/renderer/src/peer/main')
    await vi.runAllTimersAsync()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends a growing reply once per beat, as it last was', () => {
    const one = phone()
    joined(one.link)
    for (const text of ['He', 'Hello', 'Hello there']) tell('chat:items', { id: 's1', items: [theirs('growing:1', text)] })
    expect(told(one, 'chat:items')).toEqual([])
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([{ id: 's1', items: [theirs('growing:1', 'Hello there')] }])
  })

  it('keeps what went and what came in the order that holds', () => {
    const one = phone()
    joined(one.link)
    tell('chat:items', { id: 's1', items: [theirs('growing:1', 'Hi')] })
    tell('chat:items', { id: 's1', items: [theirs('m1', 'Hi.')], gone: ['growing:1'] })
    tell('chat:items', { id: 's1', items: [], gone: ['m1'] })
    tell('chat:items', { id: 's1', items: [theirs('m1', 'Hi!')] })
    vi.advanceTimersByTime(100)
    const [said] = told(one, 'chat:items') as SessionItems[]
    const held = new Map<string, SessionItem>([['growing:1', theirs('growing:1', '')]])
    for (const id of said?.gone ?? []) held.delete(id)
    for (const item of said?.items ?? []) held.set(item.id, item)
    expect([...held.values()]).toEqual([theirs('m1', 'Hi!')])
  })

  it('sends a phone only the conversation it has open, and a phone that never said every one', () => {
    const watching = phone()
    const older = phone()
    joined(watching.link)
    joined(older.link)
    watching.say({ t: 'call', id: 1, name: 'chat.watching', args: ['s2'] })
    tell('chat:items', { id: 's1', items: [theirs('a', 'one')] })
    tell('chat:items', { id: 's2', items: [theirs('b', 'two')] })
    vi.advanceTimersByTime(100)
    expect(told(watching, 'chat:items')).toEqual([{ id: 's2', items: [theirs('b', 'two')] }])
    expect(told(older, 'chat:items')).toHaveLength(2)
    expect(watching.sent).toContainEqual({ t: 'reply', id: 1, value: null })
  })

  it('sends a phone the end of a conversation, and what is before a line when it asks', async () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map((id) => theirs(id, id))
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'chat.tail', args: ['s1', 2] })
    one.say({ t: 'call', id: 2, name: 'chat.before', args: ['s1', 'd', 2] })
    one.say({ t: 'call', id: 3, name: 'chat.before', args: ['s1', 'gone', 2] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 1, value: { items: all.slice(3), left: 3 } })
    expect(one.sent).toContainEqual({ t: 'reply', id: 2, value: { items: all.slice(1, 3), left: 1 } })
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: { items: [], left: 0 } })
  })

  it('sends a phone that can take them the rows that changed, and an older one the whole list', () => {
    const row = (id: string, at: number): unknown => ({ id, at, title: id })
    const newer = phone()
    const older = phone()
    joined(newer.link)
    joined(older.link)
    newer.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged']] })
    tell('chat:sessions', [row('a', 2), row('b', 1)])
    vi.advanceTimersByTime(300)
    tell('chat:sessions', [row('b', 3), row('c', 0)])
    vi.advanceTimersByTime(300)
    tell('chat:sessions', [row('b', 3), row('c', 0)])
    vi.advanceTimersByTime(300)
    expect(told(newer, 'chat:sessions')).toEqual([[row('a', 2), row('b', 1)]])
    expect(told(newer, 'chat:sessionsChanged')).toEqual([{ changed: [row('b', 3), row('c', 0)], gone: ['a'] }])
    expect(told(older, 'chat:sessions')).toHaveLength(3)
  })

  it('sends a phone that can take them the messages with each run of steps as one line, and a run as it grows', async () => {
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Fix it' }, { kind: 'did', id: 'd1', what: 'Read a.ts' }]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.watching', args: ['s1'] })
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({
      t: 'reply',
      id: 3,
      value: { items: [all[0], { kind: 'steps', id: 'steps:d1', ids: ['d1'], latest: 'Read a.ts' }], left: 0 },
    })
    tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd2', what: 'Ran npm test' }] })
    tell('chat:items', { id: 's1', items: [theirs('t1', 'Done')] })
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([
      {
        id: 's1',
        items: [{ kind: 'steps', id: 'steps:d1', ids: ['d1', 'd2'], latest: 'Ran npm test' }, theirs('t1', 'Done')],
        gone: ['steps:d1'],
      },
    ])
    one.say({ t: 'call', id: 4, name: 'chat.steps', args: ['s1', ['d1', 'd2']] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({
      t: 'reply',
      id: 4,
      value: [
        { kind: 'did', id: 'd1', what: 'Read a.ts' },
        { kind: 'did', id: 'd2', what: 'Ran npm test' },
      ],
    })
  })

  it('sends a phone what moved in the order it now has, from the first place it differs', async () => {
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Fix it' }, theirs('growing:1', 'Look')]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.watching', args: ['s1'] })
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd1', what: 'Read a.ts' }] })
    tell('chat:items', { id: 's1', items: [theirs('t1', 'Looked')], gone: ['growing:1'] })
    vi.advanceTimersByTime(100)
    const page = new Map<string, SessionItem>([['m1', all[0] as SessionItem], ['growing:1', theirs('growing:1', 'Look')]])
    for (const said of told(one, 'chat:items') as SessionItems[]) {
      for (const id of said.gone ?? []) page.delete(id)
      for (const item of said.items) page.set(item.id, item)
    }
    expect([...page.keys()]).toEqual(['m1', 'steps:d1', 't1'])
  })

  it('sends a phone pictures by name, and a picture when it asks for it', async () => {
    const picture = { media: 'image/png', data: 'AAAA' }
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Look', images: [picture] }]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps', 'pictures']] })
    one.say({ t: 'call', id: 2, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    const ref = 's1\nm1\n0'
    expect(one.sent).toContainEqual({
      t: 'reply',
      id: 2,
      value: { items: [{ kind: 'mine', id: 'm1', text: 'Look', images: [{ media: 'image/png', data: '', ref }] }], left: 0 },
    })
    one.say({ t: 'call', id: 3, name: 'chat.picture', args: [ref, 660] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: picture })
  })

  it('sends a phone that folds steps nothing of a conversation until it has asked for its end', async () => {
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Fix it' }]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.watching', args: ['s1'] })
    tell('chat:items', { id: 's1', items: [{ kind: 'did', id: 'd1', what: 'Read a.ts' }] })
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([])
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    tell('chat:items', { id: 's1', items: [theirs('t1', 'Done')] })
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([{ id: 's1', items: [theirs('t1', 'Done')] }])
  })

  it('sends the list only as it last was', () => {
    const one = phone()
    joined(one.link)
    tell('chat:sessions', ['first'])
    tell('chat:sessions', ['second'])
    tell('settings:changed', { theme: 'dark' })
    expect(told(one, 'settings:changed')).toHaveLength(1)
    vi.advanceTimersByTime(300)
    expect(told(one, 'chat:sessions')).toEqual([['second']])
  })
})
