import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { holdClaude } from '../src/main/sessions/claude'
import type { Driver, Heard, Signal } from '../src/main/sessions/heard'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { SessionNotice, SessionsDeps } from '../src/main/sessions'
import type { ChatSession, SessionItem, SessionItems, SessionMode } from '../src/shared/api'

/**
 * What a conversation does, with nothing of the tool in it.
 *
 * `Sessions` takes the outside world as dependencies for this reason: the
 * process, the disk and the account are all replaced here, so what is being
 * checked is the rule about when something is asked, what a row says while it
 * waits, and what happens to a card once it is answered.
 */

const ROOT = '/work/app'

interface Fake {
  readonly made: { root: string; id: string; resume: boolean; mode: SessionMode; model?: string }[]
  readonly sent: { text: string; images?: readonly unknown[] }[]
  readonly answered: [string, string][]
  readonly permitted: [string, readonly string[]][]
  stopped: number
  ended: number
  closing: Promise<void>
  hear(heard: Partial<Heard>): void
}

function fakeClaude(): { claude: typeof holdClaude; fake: Fake } {
  let heard: ((heard: Heard) => void) | undefined
  const fake: Fake = {
    made: [],
    sent: [],
    answered: [],
    permitted: [],
    stopped: 0,
    ended: 0,
    closing: Promise.resolve(),
    hear: (said) => heard?.({ items: [], gone: [], signals: [], ...said }),
  }
  const claude: typeof holdClaude = (options, hear) => {
    fake.made.push({ ...options })
    heard = hear
    const driver: Driver = {
      send: (text, images) => fake.sent.push({ text, ...(images === undefined ? {} : { images }) }),
      answer: (ask, answer) => fake.answered.push([ask, String(answer)]),
      permit: (mode, again) => fake.permitted.push([mode, again]),
      stop: () => (fake.stopped += 1),
      end: () => {
        fake.ended += 1
        return fake.closing
      },
    }
    return driver
  }
  return { claude, fake }
}

interface Built {
  readonly sessions: Sessions
  readonly fake: Fake
  readonly rows: (readonly ChatSession[])[]
  readonly fanned: SessionItems[]
  readonly notes: SessionNotice[]
}

function build(over: Partial<SessionsDeps> = {}): Built {
  const { claude, fake } = fakeClaude()
  const rows: (readonly ChatSession[])[] = []
  const fanned: SessionItems[] = []
  const notes: SessionNotice[] = []
  const sessions = new Sessions({
    notes: memoryNotes(),
    changed: (all) => rows.push(all),
    items: (said) => fanned.push(said),
    account: () => undefined,
    notify: (notice) => notes.push(notice),
    claude,
    disk: { list: async () => [], read: async () => undefined, has: async () => false },
    claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }),
    claudeModels: async () => undefined,
    usage: async () => ({ windows: new Map() }),
    now: () => 1_000,
    ...over,
  })
  return { sessions, fake, rows, fanned, notes }
}

const last = <T>(all: readonly T[]): T | undefined => all.at(-1)
const of = (all: readonly (readonly ChatSession[])[], id: string): ChatSession | undefined =>
  last(all)?.find((one) => one.id === id)
/** The cards that were drawn, one per card however many times it was sent again. */
const cards = (fanned: readonly SessionItems[]): SessionItem[] => [
  ...new Map(
    fanned
      .flatMap((one) => one.items)
      .filter((item) => item.kind === 'card')
      .map((item) => [item.id, item]),
  ).values(),
]

async function started(built: Built, mode: SessionMode = 'manual'): Promise<string> {
  const id = await built.sessions.send({ root: ROOT, mode, text: 'do the thing' })
  built.fake.hear({ signals: [{ kind: 'started', session: id, key: false }] })
  return id
}

describe('holding a conversation', () => {
  it('starts one and hands the message over', async () => {
    const built = build()
    const id = await started(built)
    expect(built.fake.made).toEqual([{ root: ROOT, id, resume: false, mode: 'manual' }])
    expect(built.fake.sent).toEqual([{ text: 'do the thing' }])
    expect(of(built.rows, id)?.state).toBe('working')
    expect(built.fanned[0]?.items[0]).toMatchObject({ kind: 'mine', text: 'do the thing', at: 1_000 })
  })

  it('carries pictures to the tool and into the transcript', async () => {
    const built = build()
    const images = [{ media: 'image/png', data: 'AAAA' }]
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'what is this', images })
    expect(built.fake.sent).toEqual([{ text: 'what is this', images }])
    expect(built.fanned[0]?.items[0]).toMatchObject({ kind: 'mine', images })
    expect(id).not.toBe('')
  })

  it('runs in the tool own mode, and starts again in another when the mode changes', async () => {
    const built = build()
    const id = await started(built, 'plan')
    expect(built.fake.made[0]?.mode).toBe('plan')
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'auto', text: 'go on' })
    expect(built.fake.ended).toBe(1)
    expect(built.fake.made.at(-1)?.mode).toBe('auto')
  })

  it('moves a running Claude Code into auto without starting it again, and hands back what was waiting', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [{ kind: 'asks', ask: 'a1', wanted: { kind: 'command', command: 'grep -rn limits' } }] })
    expect(of(built.rows, id)?.state).toBe('asks')

    built.sessions.mode(id, 'auto')
    expect(built.fake.permitted).toEqual([['auto', ['a1']]])
    expect(last(built.fanned)?.gone).toEqual(['card:a1'])
    expect(of(built.rows, id)).toMatchObject({ state: 'working', stands: 'Working', mode: 'auto' })

    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'auto', text: 'go on' })
    expect(built.fake.ended).toBe(0)
    expect(built.fake.made).toHaveLength(1)

    built.sessions.mode(id, 'manual')
    expect(built.fake.permitted.at(-1)).toEqual(['manual', []])
  })

  it('leaves a question up when the session goes into auto, and plan for the next message', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [{ kind: 'asks', ask: 'q1', wanted: { kind: 'question', question: 'Which table?', choices: ['A', 'B'] } }] })

    built.sessions.mode(id, 'auto')
    expect(built.fake.permitted).toEqual([['auto', []]])
    expect(of(built.rows, id)?.state).toBe('asks')

    built.sessions.mode(id, 'plan')
    expect(built.fake.permitted).toHaveLength(1)
  })

  it('will not run on a key, and offers the message back', async () => {
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'hello' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: true }] })
    expect(built.fake.ended).toBe(1)
    expect(last(built.fanned)?.items.some((item) => item.kind === 'mine' && item.unsent === true)).toBe(true)
    expect(of(built.rows, id)?.stands).toBe('Not sent')
  })
})

describe('what it may do unasked', () => {
  const read: Signal = { kind: 'asks', ask: 'a1', wanted: { kind: 'read', path: `${ROOT}/src/a.ts` } }

  it('asks about everything the tool sends while the mode is manual', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [read] })
    expect(built.fake.answered).toEqual([])
    expect(cards(built.fanned)).toHaveLength(1)
    expect(of(built.rows, id)?.state).toBe('asks')
  })

  it('says so, and shows Manual, when Claude Code does not take up auto mode', async () => {
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'auto', text: 'hi' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false, model: 'claude-haiku-4-5-20251001', mode: 'default' }] })
    expect(of(built.rows, id)?.mode).toBe('manual')
    expect(last(built.fanned)?.items[0]).toMatchObject({ kind: 'note', note: 'mode', text: expect.stringContaining('Haiku 4.5') })
  })

  it('says so too when Claude Code gives up auto mode after starting in it', async () => {
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'auto', text: 'hi' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false, model: 'claude-haiku-4-5-20251001', mode: 'auto' }] })
    expect(of(built.rows, id)?.mode).toBe('auto')
    built.fake.hear({ signals: [{ kind: 'mode', mode: 'default' }] })
    expect(of(built.rows, id)?.mode).toBe('manual')
    expect(last(built.fanned)?.items[0]).toMatchObject({ kind: 'note', note: 'mode', text: expect.stringContaining('Haiku 4.5') })
  })

  it('leaves auto to Claude Code, and asks about whatever it still sends', async () => {
    const built = build()
    await started(built, 'auto')
    expect(built.fake.made[0]?.mode).toBe('auto')
    built.fake.hear({ signals: [read] })
    expect(built.fake.answered).toEqual([])
    expect(cards(built.fanned)).toHaveLength(1)
  })

  it('says so when something is waiting and the window is elsewhere', async () => {
    const built = build()
    await started(built, 'manual')
    built.fake.hear({ signals: [{ kind: 'asks', ask: 'a3', wanted: { kind: 'command', command: 'npm test' } }] })
    expect(built.notes[0]).toMatchObject({ title: 'Needs an answer - app', body: 'Wants to run a command', asks: true })
  })

  it('says nothing when the window is watching that conversation', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.sessions.watching(id)
    built.fake.hear({ signals: [{ kind: 'asks', ask: 'a4', wanted: { kind: 'command', command: 'npm test' } }] })
    expect(built.notes).toEqual([])
  })
})

describe('answering a card', () => {
  const wanted: Signal = { kind: 'asks', ask: 'c1', wanted: { kind: 'command', command: 'npm test' } }

  it('folds it, says what was answered, and tells the tool', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [wanted] })
    built.sessions.answer(id, 'card:c1', 'once')
    expect(built.fake.answered).toEqual([['c1', 'once']])
    const folded = cards(built.fanned).at(-1)
    expect(folded?.kind === 'card' ? folded.card.answered : '').not.toBe(undefined)
    expect(of(built.rows, id)?.state).toBe('working')
  })

  it('does not ask twice about the same thing once it is allowed for the session', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [wanted] })
    built.sessions.answer(id, 'card:c1', 'session')
    built.fake.hear({ signals: [{ ...wanted, ask: 'c2' }] })
    expect(built.fake.answered).toEqual([
      ['c1', 'session'],
      ['c2', 'once'],
    ])
    expect(cards(built.fanned)).toHaveLength(1)
  })

  it('asks again about the same thing when it was only allowed once', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.fake.hear({ signals: [wanted] })
    built.sessions.answer(id, 'card:c1', 'once')
    built.fake.hear({ signals: [{ ...wanted, ask: 'c2' }] })
    expect(cards(built.fanned)).toHaveLength(2)
  })

  it('puts the line back under the answer only when it was allowed', async () => {
    const allowed = build()
    const one = await started(allowed, 'manual')
    allowed.fake.hear({
      items: [{ kind: 'did', id: 'd1', what: 'Running npm test', live: true }],
      signals: [{ ...wanted, line: 'd1' }],
    })
    allowed.sessions.answer(one, 'card:c1', 'once')
    expect(last(allowed.fanned)?.items.some((item) => item.id === 'd1')).toBe(true)

    const refused = build()
    const other = await started(refused, 'manual')
    refused.fake.hear({
      items: [{ kind: 'did', id: 'd1', what: 'Running npm test', live: true }],
      signals: [{ ...wanted, line: 'd1' }],
    })
    refused.sessions.answer(other, 'card:c1', 'no')
    expect(last(refused.fanned)?.items.some((item) => item.id === 'd1')).toBe(false)
  })

  it('ignores an answer to a card that is not up', async () => {
    const built = build()
    const id = await started(built, 'manual')
    built.sessions.answer(id, 'card:nothing', 'once')
    expect(built.fake.answered).toEqual([])
  })
})

describe('when a turn ends', () => {
  it('marks it unread and says so, until the window looks at it', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'said', text: 'Here is the answer' }, { kind: 'ended', how: 'done' }] })
    expect(of(built.rows, id)?.state).toBe('unread')
    expect(of(built.rows, id)?.stands).toBe('Here is the answer')
    expect(built.notes.at(-1)).toMatchObject({ title: 'Finished - app', body: 'Here is the answer', asks: false })
    expect(built.sessions.wanting()).toBe(1)

    built.sessions.watching(id)
    expect(of(built.rows, id)?.state).toBe('idle')
    expect(built.sessions.wanting()).toBe(0)
  })

  it('dates an answer by when it first arrived, since the stream does not say', async () => {
    let now = 1_000
    const built = build({ now: () => now })
    await started(built)
    now = 5_000
    built.fake.hear({ items: [{ kind: 'theirs', id: 'growing:1', text: 'Hel' }] })
    now = 9_000
    built.fake.hear({ items: [{ kind: 'theirs', id: 'growing:1', text: 'Hello' }] })
    expect(built.fanned.at(-1)?.items[0]).toMatchObject({ text: 'Hello', at: 5_000 })
  })

  it('says so when it stops with an error or at the limit', async () => {
    const built = build()
    await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'failed', text: 'Error: spawn claude ENOENT\nat line 2' }] })
    expect(built.notes.at(-1)).toMatchObject({ title: 'Stopped with an error - app', body: 'Error: spawn claude ENOENT' })

    const again = build()
    await started(again)
    again.fake.hear({ signals: [{ kind: 'ended', how: 'limit' }] })
    expect(again.notes.at(-1)?.title).toBe('Plan limit reached - app')
  })

  it('says nothing about an answer the window is already showing', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.watching(id)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    expect(built.notes).toEqual([])
  })

  it('leaves a note when the limit is reached', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'limit' }] })
    expect(of(built.rows, id)?.state).toBe('limit')
    expect(last(built.fanned)?.items.some((item) => item.kind === 'note' && item.note === 'limit')).toBe(true)
  })
})

describe('stopping', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('asks the tool first', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.stop(id)
    expect(built.fake.stopped).toBe(1)
    expect(of(built.rows, id)?.state).toBe('working')
  })

  it('takes the process down when the tool does not answer', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.stop(id)
    vi.advanceTimersByTime(5_000)
    expect(built.fake.ended).toBe(1)
    expect(of(built.rows, id)?.state).toBe('idle')
    expect(of(built.rows, id)?.stands).toBe('Stopped')
  })

  it('does nothing to a conversation that is not running', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    built.sessions.stop(id)
    expect(built.fake.stopped).toBe(0)
  })
})

describe('the list', () => {
  it('renames without touching the conversation', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.rename(id, '  The renamed one  ')
    expect(of(built.rows, id)?.title).toBe('The renamed one')
    built.sessions.rename(id, '   ')
    expect(of(built.rows, id)?.title).toBe('The renamed one')
  })

  it('takes a hidden one out and lets its process go', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.hide(id)
    expect(built.fake.ended).toBe(1)
    expect(of(built.rows, id)).toBeUndefined()
  })

  it('shows what is on disk beside what is being held', async () => {
    const built = build({
      disk: {
        list: async () => [
          { id: 'from-a-terminal', title: 'Written elsewhere', stands: 'Did a thing', at: 500, driven: false },
        ],
        read: async () => undefined,
        has: async () => false,
      },
    })
    const id = await started(built)
    const all = await built.sessions.list([ROOT])
    expect(all.map((one) => one.id)).toEqual([id, 'from-a-terminal'])
    expect(all.every((one) => one.root === ROOT)).toBe(true)
  })

  it('lists several projects at once, newest first', async () => {
    const other = '/work/another'
    const built = build({
      disk: {
        list: async (root) => [
          root === ROOT
            ? { id: 'here', title: 'About this one', stands: '', at: 100, driven: false }
            : { id: 'there', title: 'About the other', stands: '', at: 900, driven: false },
        ],
        read: async () => undefined,
        has: async () => false,
      },
    })
    const all = await built.sessions.list([ROOT, other])
    expect(all.map((one) => one.id)).toEqual(['there', 'here'])
    expect(await built.sessions.list([other])).toHaveLength(1)
  })

  it('deletes the file the tool keeps a conversation in', async () => {
    const thrown: string[] = []
    const built = build({
      disk: {
        list: async () => [{ id: 'old', title: 'An old one', stands: '', at: 1, driven: false }],
        read: async () => undefined,
        has: async () => false,
        delete: async (_root, id) => {
          thrown.push(id)
          return true
        },
      },
    })
    await built.sessions.list([ROOT])
    expect(await built.sessions.remove('old')).toBe(true)
    expect(thrown).toEqual(['old'])
    expect(of(built.rows, 'old')).toBeUndefined()
    expect(await built.sessions.remove('never-there')).toBe(false)
  })

  it('stops the process of a conversation it deletes', async () => {
    const built = build({ disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    const id = await started(built)
    expect(await built.sessions.remove(id)).toBe(false)
    expect(built.fake.ended).toBe(1)
    expect(of(built.rows, id)).toBeUndefined()
  })

  it('deletes the file once the process has gone, since it writes to it as it exits', async () => {
    const order: string[] = []
    const built = build({
      disk: {
        list: async () => [],
        read: async () => undefined,
        has: async () => false,
        delete: async () => {
          order.push('deleted')
          return true
        },
      },
    })
    const id = await started(built)
    built.fake.closing = new Promise((resolve) =>
      setTimeout(() => {
        order.push('gone')
        resolve()
      }, 5),
    )
    expect(await built.sessions.remove(id)).toBe(true)
    expect(order).toEqual(['gone', 'deleted'])
  })

  it('lets go of one about to be continued in a terminal', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    built.sessions.handOver(id)
    expect(built.fake.ended).toBe(1)
  })

  it('will not let go of one in the middle of a turn', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.handOver(id)
    expect(built.fake.ended).toBe(0)
  })
})

describe('what the status bar is drawn from', () => {
  const OPUS = 'claude-opus-5'
  const plan = { fiveHour: { part: 0.13, resetsAt: 5_000 }, sevenDay: { part: 0.19, resetsAt: 9_000 } }

  it('measures the plan and a model\'s window without a turn, and the plan at most once a minute', async () => {
    let clock = 1_000
    const asked: (readonly string[])[] = []
    const said: unknown[] = []
    const built = build({
      now: () => clock,
      plan: (fresh) => said.push(fresh),
      usage: async (models) => {
        asked.push(models)
        return { plan, windows: new Map([[OPUS, 400_000]]) }
      },
    })
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'hello' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false, model: OPUS }] })
    await built.sessions.measure()
    built.fake.hear({ signals: [{ kind: 'spend', used: 100_000 }, { kind: 'ended', how: 'done' }] })

    expect(asked).toEqual([[OPUS]])
    expect(built.sessions.plan()).toEqual(plan)
    expect(said).toEqual([plan])
    expect(of(built.rows, id)?.spend).toEqual({ used: 100_000, window: 400_000 })

    await built.sessions.measure()
    expect(asked).toHaveLength(1)
    clock += 60_001
    await built.sessions.measure()
    expect(asked).toEqual([[OPUS], []])
  })

  it('measures a model first seen in a project\'s list', async () => {
    const built = build({
      disk: {
        list: async () => [{ id: 'old', title: 'An old one', stands: '', at: 1, driven: false, model: OPUS, used: 50_000 }],
        read: async () => undefined,
        has: async () => true,
      },
      usage: async () => ({ windows: new Map([[OPUS, 400_000]]) }),
    })
    await built.sessions.list([ROOT])
    await built.sessions.measure()
    expect(of(built.rows, 'old')?.spend).toEqual({ used: 50_000, window: 400_000 })
  })

  it('measures a model that turns up while the plan is being measured', async () => {
    const asked: (readonly string[])[] = []
    let release: (() => void) | undefined
    const built = build({
      disk: {
        list: async () => [{ id: 'old', title: 'An old one', stands: '', at: 1, driven: false, model: OPUS, used: 50_000 }],
        read: async () => undefined,
        has: async () => true,
      },
      usage: (models) => {
        asked.push(models)
        if (asked.length > 1) return Promise.resolve({ windows: new Map([[OPUS, 400_000]]) })
        return new Promise((done) => {
          release = () => done({ windows: new Map() })
        })
      },
    })
    const first = built.sessions.measure()
    await built.sessions.list([ROOT])
    release?.()
    await first
    await vi.waitFor(() => expect(of(built.rows, 'old')?.spend?.window).toBe(400_000))
    expect(asked).toEqual([[], [OPUS]])
  })

  it('says what a conversation read from disk has cost once it is opened', async () => {
    const built = build({
      disk: {
        list: async () => [{ id: 'old', title: 'An old one', stands: '', at: 1, driven: false }],
        read: async () => ({ items: [], cost: 0.64 }),
        has: async () => true,
      },
    })
    await built.sessions.list([ROOT])
    await built.sessions.items('old')
    expect(of(built.rows, 'old')?.spend?.cost).toBe(0.64)
  })

  it('adds up what every run of the tool has cost in one conversation', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'spend', cost: 0.25 }, { kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'auto', text: 'go on' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false }] })
    built.fake.hear({ signals: [{ kind: 'spend', cost: 0.05 }] })
    built.fake.hear({ signals: [{ kind: 'spend', cost: 0.1 }, { kind: 'ended', how: 'done' }] })
    expect(built.fake.made).toHaveLength(2)
    expect(of(built.rows, id)?.spend?.cost).toBeCloseTo(0.35)
  })
})

describe('what the search offers first', () => {
  it('keeps when a conversation was last in front', async () => {
    let clock = 1_000
    const built = build({ now: () => clock })
    const id = await started(built)
    clock = 5_000
    built.sessions.watching(id)
    built.sessions.watching(undefined)
    expect((await built.sessions.list([ROOT])).find((one) => one.id === id)?.seen).toBe(5_000)
  })
})
