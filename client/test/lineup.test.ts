import { describe, expect, it } from 'vitest'

import { answerLines } from '../src/cli/start'
import { letGo, taken } from '../src/main/lineup'
import type { Standing } from '../src/main/lineup'
import type { holdClaude } from '../src/main/sessions/claude'
import type { Driver } from '../src/main/sessions/heard'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { ChatSession } from '../src/shared/api'

/**
 * How many conversations work at once: a slot is held only while one works,
 * and a free slot goes to the conversation with queued messages highest on
 * the board.
 */

const ROOT = '/work/app'
const NOW = 1_000_000

const one = (id: string, change: Partial<Standing> = {}): Standing => ({ id, state: 'idle', at: 0, waiting: false, ...change })

describe('the slot rule', () => {
  it('counts only what is working, not one waiting for an answer', () => {
    expect(taken([one('a', { state: 'working' }), one('b', { state: 'asks' }), one('c', { state: 'unread' }), one('d')])).toBe(1)
  })

  it('gives free slots to the waiting ones highest on the board, whatever their age', () => {
    const all = [one('a', { waiting: true, at: 3 }), one('b', { waiting: true, at: 2 }), one('c', { waiting: true, at: 1 }), one('d', { state: 'working' })]
    expect(letGo(all, 3, ['c', 'b', 'a'])).toEqual(['c', 'b'])
    expect(letGo(all, 1, ['c', 'b', 'a'])).toEqual([])
    expect(letGo(all, 0, [])).toEqual(['a', 'b', 'c'])
  })

  it('neither counts a general question nor holds one back', () => {
    const all = [one('q', { state: 'working', question: true }), one('r', { waiting: true, question: true }), one('a', { waiting: true }), one('d', { state: 'working' })]
    expect(taken(all)).toBe(1)
    expect(letGo(all, 1, [])).toEqual(['r'])
    expect(letGo(all, 2, [])).toEqual(['r', 'a'])
  })
})

function build(limit: number): {
  readonly sessions: Sessions
  readonly sent: [string, string][]
  readonly clock: { now: number }
  readonly order: string[]
  end: (id: string, how?: 'done' | 'stopped') => void
  wake: () => void
  rows: () => readonly ChatSession[]
  readonly pauses: number[]
} {
  const sent: [string, string][] = []
  const hears = new Map<string, Parameters<typeof holdClaude>[1]>()
  const clock = { now: NOW }
  const order: string[] = []
  let wake: (() => void) | undefined
  const pauses: number[] = []
  let rows: readonly ChatSession[] = []
  const claude: typeof holdClaude = (options, hear) => {
    hears.set(options.id, hear)
    const driver: Driver = {
      send: (text) => sent.push([options.id, text]),
      answer: () => undefined,
      permit: () => undefined,
      control: async () => ({}),
      stop: () => undefined,
      end: () => Promise.resolve(),
    }
    return driver
  }
  const sessions = new Sessions({
    notes: memoryNotes(),
    changed: (all) => (rows = all),
    items: () => undefined,
    account: () => undefined,
    notify: () => undefined,
    claude,
    disk: { list: async () => [], read: async () => undefined, has: async () => false },
    claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }),
    claudeModels: async () => undefined,
    claudeProgram: async () => undefined,
    usage: async () => ({ windows: new Map() }),
    now: () => clock.now,
    limit: () => limit,
    order: () => order,
    later: (run, ms) => {
      pauses.push(ms)
      wake = run
      return () => (wake = undefined)
    },
  })
  return {
    sessions,
    sent,
    clock,
    order,
    end: (id, how = 'done') => hears.get(id)?.({ items: [], gone: [], signals: [{ kind: 'ended', how }] }),
    wake: () => wake?.(),
    rows: () => rows,
    pauses,
  }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0))
const said = (sent: readonly [string, string][]): string[] => sent.map(([, text]) => text)

describe('conversations held to the limit', () => {
  it('begins a task as a conversation whose message waits, and sends it the moment a turn ends', async () => {
    const built = build(1)
    const a = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    const b = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'b' })
    await built.sessions.send({ session: b, root: ROOT, mode: 'manual', text: 'b again' })
    expect(said(built.sent)).toEqual(['a'])
    expect(built.rows().find((row) => row.id === b)).toMatchObject({ waits: true, queued: [{ text: 'b' }, { text: 'b again' }] })
    built.end(a)
    await settle()
    expect(said(built.sent)).toEqual(['a'])
    expect(built.pauses.at(-1)).toBeGreaterThanOrEqual(3_000)
    expect(built.pauses.at(-1)).toBeLessThanOrEqual(10_000)
    built.wake()
    await settle()
    expect(said(built.sent)).toEqual(['a', 'b'])
  })

  it('holds an answer to a finished conversation while as many work as the limit', async () => {
    const built = build(1)
    const a = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    built.end(a)
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'b' })
    built.wake()
    await built.sessions.send({ session: a, root: ROOT, mode: 'manual', text: 'more' })
    expect(said(built.sent)).toEqual(['a', 'b'])
    expect(built.rows().find((row) => row.id === a)).toMatchObject({ waits: true, queued: [{ text: 'more' }] })
  })

  it('stopped with a message of its own queued, lets one higher on the board with queued messages go first', async () => {
    const built = build(1)
    const top = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'top' })
    built.end(top)
    const third = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'third' })
    await built.sessions.send({ session: third, root: ROOT, mode: 'manual', text: 'third next' })
    await built.sessions.send({ session: top, root: ROOT, mode: 'manual', text: 'top next' })
    built.order.push(top, third)
    expect(said(built.sent)).toEqual(['top', 'third'])
    built.end(third, 'stopped')
    built.wake()
    await settle()
    expect(said(built.sent)).toEqual(['top', 'third', 'top next'])
    expect(built.rows().find((row) => row.id === third)).toMatchObject({ waits: true, queued: [{ text: 'third next' }] })
  })

  it('goes on to its own next message where nothing above waits', async () => {
    const built = build(1)
    const a = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    await built.sessions.send({ session: a, root: ROOT, mode: 'manual', text: 'a next' })
    built.end(a)
    built.wake()
    await settle()
    expect(said(built.sent)).toEqual(['a', 'a next'])
  })

  it('finds a conversation not begun yet by what waits in it', async () => {
    const built = build(1)
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    const b = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'Fix the flaky upload test' })
    expect(built.sessions.queuedHolding([ROOT], 'flaky upload')).toEqual([{ id: b, root: ROOT, count: 1, said: 'Fix the flaky upload test' }])
    expect(built.sessions.queuedHolding(['/elsewhere'], 'flaky')).toEqual([])
  })

  it('never holds a general question, which is not a task', async () => {
    const built = build(1)
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'why?', question: true })
    expect(said(built.sent)).toEqual(['a', 'why?'])
  })

  it('sends everything at once with no limit', async () => {
    const built = build(0)
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'a' })
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'b' })
    expect(said(built.sent)).toEqual(['a', 'b'])
  })
})

describe('the answer the command prints', () => {
  it('says a task that waits for a slot is queued, with its id', () => {
    expect(answerLines({ ok: true, tasks: [{ answer: 'queued', id: 'abc', note: 'later' }, { answer: 'refused' }] }, false)).toBe(
      '1 Queued abc: later\n2 Refused',
    )
  })
})
