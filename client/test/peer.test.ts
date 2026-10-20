import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Link } from '../src/renderer/src/link'
import type { LinkMessage } from '../src/shared/pairing'
import type { SessionItem, SessionItems } from '../src/shared/api'

let joined: (link: Link) => void = () => undefined
const shareJoins = new Map<string, (link: Link) => void>()
const shareCalls: unknown[][] = []
vi.mock('../src/renderer/src/link', () => ({
  listen: (pairing: { readonly key: string }, join: (link: Link) => void) => {
    if (pairing.key === 'k') joined = join
    else shareJoins.set(pairing.key, join)
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
          shares: () => Promise.resolve([{ id: 'link-1', key: 'link-key' }]),
          onShares: () => () => undefined,
          share: (...args: unknown[]) => {
            shareCalls.push(args)
            return Promise.resolve({ kind: 'file', title: 'report.html', expiresAt: 1 })
          },
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

  it('answers a link page only about its own link, and nothing a phone may ask', async () => {
    const page = phone()
    shareJoins.get('link-key')?.(page.link)
    page.say({ t: 'call', id: 1, name: 'chat.items', args: ['any'] })
    page.say({ t: 'call', id: 2, name: 'manager.view', args: [] })
    page.say({ t: 'call', id: 3, name: 'share.about', args: [] })
    await vi.runAllTimersAsync()
    expect(page.sent).toEqual([
      { t: 'reply', id: 1, error: 'Not shared' },
      { t: 'reply', id: 2, error: 'Not shared' },
      { t: 'reply', id: 3, value: { kind: 'file', title: 'report.html', expiresAt: 1 } },
    ])
    expect(shareCalls).toEqual([['link-1', 'share.about', []]])
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

  it('carries an old pending question through the actual 60-item phone page without skipping earlier history', async () => {
    const question: SessionItem = { kind: 'card', id: 'old-question', card: { kind: 'question', title: 'Choose timing checks', choices: ['Browser', 'Harness'] } }
    const later = Array.from({ length: 140 }, (_value, index) => theirs(`later-${String(index)}`, 'Progress'))
    const all = [question, ...later]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 2, value: { items: [...later.slice(81), question], left: 81 } })
    one.say({ t: 'call', id: 3, name: 'chat.turnsBefore', args: ['s1', 'later-81', 200] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: { items: later.slice(0, 81), left: 0 } })
  })

  it('retains every pending card when they exceed the phone page size', async () => {
    const cards: SessionItem[] = Array.from({ length: 65 }, (_value, index) => ({ kind: 'card', id: `q${String(index)}`, card: { kind: 'question', title: 'Choose an option' } }))
    const history = Array.from({ length: 140 }, (_value, index) => theirs(`history-${String(index)}`, 'Progress'))
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve([...cards, ...history]) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 2, value: { items: cards, left: 140 } })
    one.say({ t: 'call', id: 3, name: 'chat.turnsBefore', args: ['s1', 'q0', 200] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: { items: history, left: 0 } })
  })

  it('delivers the old question through the real peer into the phone bridge and removes its pinned copy once answered', async () => {
    const question: Extract<SessionItem, { kind: 'card' }> = { kind: 'card', id: 'old-question', card: { kind: 'question', title: 'Choose timing checks', choices: ['Browser', 'Harness'] } }
    const history = Array.from({ length: 140 }, (_value, index) => theirs(`history-${String(index)}`, 'Progress'))
    const all = [question, ...history]
    const hostCall = (name: string): Promise<SessionItem[] | null> => Promise.resolve(name === 'chat.items' ? all : null)
    vi.stubGlobal('window', { ...window, clearTimeout, geckit: { peer: { ...window.geckit.peer, call: hostCall } } })
    vi.stubGlobal('document', { querySelector: () => null })
    const host = phone()
    const receivers: ((message: LinkMessage) => void)[] = []
    const hostLink: Link = { ...host.link, send: (message) => receivers.forEach((receive) => receive(message)) }
    joined(hostLink)
    const phoneLink: Link = { ...phone().link, send: host.say, onMessage: (receive) => receivers.push(receive) }
    const { installGeckit } = await import('../src/renderer/src/phone')
    installGeckit(phoneLink, { home: '/Users/alex', platform: 'darwin' }, 'test-host')
    window.geckit.peer.call = hostCall
    window.geckit.chat.watching('s1')
    const items = await window.geckit.chat.items('s1')
    expect(items).toEqual([...history.slice(81), question])
    const page = new Map(items.map((item) => [item.id, item]))
    window.geckit.chat.onItems((said) => {
      for (const id of said.gone ?? []) page.delete(id)
      for (const item of said.items) page.set(item.id, item)
    })
    tell('chat:items', { id: 's1', items: [{ ...question, card: { ...question.card, answered: 'Browser' } }] })
    await vi.advanceTimersByTimeAsync(100)
    expect([...page.values()].some((item) => item.kind === 'card' && item.id === question.id)).toBe(false)
    expect([...page.keys()]).toEqual(['steps:old-question', ...history.map((item) => item.id)])
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

  it('keeps a question received while its conversation snapshot is loading', async () => {
    const all: SessionItem[] = [theirs('t1', 'Choose how to continue')]
    const question: SessionItem = { kind: 'card', id: 'q1', card: { kind: 'question', title: 'Which option?', choices: ['First', 'Second'] } }
    let finish: (items: SessionItem[]) => void = () => undefined
    const snapshot = new Promise<SessionItem[]>((resolve) => { finish = resolve })
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => snapshot } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.watching', args: ['s1'] })
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    tell('chat:items', { id: 's1', items: [question] })
    vi.advanceTimersByTime(100)
    finish(all)
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: { items: [...all, question], left: 0 } })
    tell('chat:items', { id: 's1', items: [theirs('t2', 'Waiting for your answer')] })
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([{ id: 's1', items: [theirs('t2', 'Waiting for your answer'), question], gone: ['q1'] }])
  })

  it('does not restore a question resolved during a conversation refresh', async () => {
    const question: SessionItem = { kind: 'card', id: 'q1', card: { kind: 'question', title: 'Which option?' } }
    const all: SessionItem[] = [theirs('t1', 'Choose how to continue'), question]
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => Promise.resolve(all) } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['sessionsChanged', 'steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.watching', args: ['s1'] })
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    let finish: (items: SessionItem[]) => void = () => undefined
    const snapshot = new Promise<SessionItem[]>((resolve) => { finish = resolve })
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => snapshot } } })
    one.say({ t: 'call', id: 4, name: 'chat.turns', args: ['s1', 60] })
    tell('chat:items', { id: 's1', items: [], gone: ['q1'] })
    vi.advanceTimersByTime(100)
    finish(all)
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 4, value: { items: [all[0]], left: 0 } })
    tell('chat:items', { id: 's1', items: [theirs('t2', 'Continuing')] })
    vi.advanceTimersByTime(100)
    expect(told(one, 'chat:items')).toEqual([
      { id: 's1', items: [], gone: ['q1'] },
      { id: 's1', items: [theirs('t2', 'Continuing')] },
    ])
  })

  it('keeps deletion and reinsertion order across a delayed snapshot', async () => {
    const all = [theirs('a', 'First'), theirs('b', 'Second')]
    let finish: (items: SessionItem[]) => void = () => undefined
    const snapshot = new Promise<SessionItem[]>((resolve) => { finish = resolve })
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call: () => snapshot } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.turns', args: ['s1', 60] })
    tell('chat:items', { id: 's1', items: [theirs('b', 'Updated second'), theirs('c', 'Third')] })
    tell('chat:items', { id: 's1', gone: ['b'], items: [theirs('b', 'Moved second')] })
    tell('chat:items', { id: 's1', items: [theirs('c', 'Updated third')] })
    vi.advanceTimersByTime(100)
    finish(all)
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({
      t: 'reply', id: 2,
      value: { items: [all[0], theirs('c', 'Updated third'), theirs('b', 'Moved second')], left: 0 },
    })
  })

  it('retries a failed snapshot without retaining its buffered changes', async () => {
    let fail: (error: Error) => void = () => undefined
    const snapshot = new Promise<SessionItem[]>((_resolve, reject) => { fail = reject })
    const call = vi.fn().mockReturnValue(snapshot)
    vi.stubGlobal('window', { ...window, geckit: { peer: { ...window.geckit.peer, call } } })
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.turns', args: ['s1', 60] })
    tell('chat:items', { id: 's1', items: [theirs('old', 'Old snapshot update')] })
    vi.advanceTimersByTime(100)
    fail(new Error('Snapshot failed'))
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 2, error: 'Snapshot failed' })
    const all = [theirs('new', 'Fresh snapshot')]
    call.mockResolvedValue(all)
    one.say({ t: 'call', id: 3, name: 'chat.turns', args: ['s1', 60] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, value: { items: all, left: 0 } })
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
