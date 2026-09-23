import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { holdClaude } from '../src/main/sessions/claude'
import type { GoalRead } from '../src/main/sessions/claude-read'
import type { Ran, runShell } from '../src/main/sessions/shell'
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
  readonly sent: { text: string; images?: readonly unknown[]; before?: readonly string[] }[]
  readonly answered: [string, string][]
  readonly permitted: [string, readonly string[]][]
  /** Requests on the control channel, and what the tool says back to each kind. */
  readonly controls: Readonly<Record<string, unknown>>[]
  readonly answers: Record<string, Readonly<Record<string, unknown>>>
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
    controls: [],
    answers: {},
    stopped: 0,
    ended: 0,
    closing: Promise.resolve(),
    hear: (said) => heard?.({ items: [], gone: [], signals: [], ...said }),
  }
  const claude: typeof holdClaude = (options, hear) => {
    fake.made.push({ ...options })
    heard = hear
    const driver: Driver = {
      send: (text, images, before) =>
        fake.sent.push({
          text,
          ...(images === undefined ? {} : { images }),
          ...(before === undefined || before.length === 0 ? {} : { before }),
        }),
      answer: (ask, answer) => fake.answered.push([ask, String(answer)]),
      permit: (mode, again) => fake.permitted.push([mode, again]),
      control: async (request) => {
        fake.controls.push(request)
        return fake.answers[String(request['subtype'])] ?? {}
      },
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

  it('is not moved up the list by what a turn says as it goes, so two at work keep their places', async () => {
    const hears = new Map<string, (heard: Heard) => void>()
    let now = 1_000
    const quiet: Driver = {
      send: () => undefined,
      answer: () => undefined,
      permit: () => undefined,
      control: async () => ({}),
      stop: () => undefined,
      end: () => Promise.resolve(),
    }
    const built = build({
      now: () => now,
      claude: (options, hear) => {
        hears.set(options.id, hear)
        return quiet
      },
    })
    const order = async (): Promise<string[]> => (await built.sessions.list([ROOT])).map((one) => one.id)

    const first = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'one' })
    now = 2_000
    const second = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'two' })
    expect(await order()).toEqual([second, first])

    now = 3_000
    hears.get(first)?.({ items: [{ kind: 'did', id: 'd1', what: 'Running npm test', live: true }], gone: [], signals: [] })
    expect(await order()).toEqual([second, first])

    hears.get(first)?.({ items: [], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    expect(await order()).toEqual([first, second])
  })

  it('follows `/clear` into the conversation it starts, and keeps the one it left in the list', async () => {
    const shown: string[] = []
    const built = build({ show: (id) => shown.push(id) })
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })

    built.fake.hear({ signals: [{ kind: 'started', session: 'cleared', key: false }] })
    expect(shown).toEqual(['cleared'])
    expect(await built.sessions.items('cleared')).toEqual([])
    expect(of(built.rows, 'cleared')).toMatchObject({ root: ROOT, title: '', here: true })
    expect(of(built.rows, id)).toMatchObject({ root: ROOT, title: 'do the thing' })

    await built.sessions.send({ session: 'cleared', root: ROOT, mode: 'manual', text: 'start again' })
    expect(of(built.rows, 'cleared')?.title).toBe('start again')
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

describe('a goal', () => {
  const condition = 'the tests pass'
  const met: GoalRead['ended'] = { kind: 'note', id: '', note: 'goal', text: `Goal met: ${condition}`, detail: 'All 12 pass.' }

  it('shows on the row as soon as it is sent, and goes when it is cleared', async () => {
    const built = build({
      disk: { list: async () => [], read: async () => undefined, has: async () => false, goal: async () => ({ goal: { condition, checks: 0 } }) },
    })
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    expect(of(built.rows, id)?.goal).toEqual({ condition, checks: 0 })
    expect(built.fake.sent.at(-1)).toEqual({ text: `/goal ${condition}` })
    built.fake.hear({ signals: [{ kind: 'ended', how: 'stopped' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.state).not.toBe('working'))
    expect(of(built.rows, id)?.goal).toEqual({ condition, checks: 0 })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: '/goal clear' })
    expect(of(built.rows, id)?.goal).toBeUndefined()
  })

  it('stands on the row while it waits its turn behind the message that started the work', async () => {
    const built = build()
    const id = await started(built)
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    expect(built.fake.sent).toEqual([{ text: 'do the thing' }])
    expect(of(built.rows, id)?.goal).toEqual({ condition, checks: 0 })
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: `/goal ${condition}` }))
  })

  it('counts the checks that send it back to work while the turn goes on, and no other Stop hook', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    built.fake.hear({ signals: [{ kind: 'held', hook: condition, reason: 'Two still fail.' }] })
    built.fake.hear({ signals: [{ kind: 'held', hook: 'npm run lint', reason: 'Lint fails.' }] })
    built.fake.hear({ signals: [{ kind: 'held', hook: condition, reason: 'One still fails.' }] })
    expect(of(built.rows, id)?.goal).toEqual({ condition, checks: 2, reason: 'One still fails.' })
  })

  it('stops the turn to clear it, since a goal keeps the turn going, and tells the tool once it has stopped', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: '/goal clear' })
    expect(built.fake.stopped).toBe(1)
    expect(of(built.rows, id)?.goal).toBeUndefined()
    expect(built.fake.sent.at(-1)).toEqual({ text: `/goal ${condition}` })
    built.fake.hear({ signals: [{ kind: 'ended', how: 'stopped' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: '/goal clear' }))
  })

  it('reads how the check went at the end of each turn, and says so once it is met', async () => {
    let read: GoalRead = { goal: { condition, checks: 1, reason: 'Two still fail.' } }
    const built = build({
      disk: { list: async () => [], read: async () => undefined, has: async () => false, goal: async () => read },
    })
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.goal).toEqual({ condition, checks: 1, reason: 'Two still fail.' }))

    read = { ended: met }
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.goal).toBeUndefined())
    expect(last(built.fanned)?.items).toEqual([expect.objectContaining({ note: 'goal', text: `Goal met: ${condition}`, detail: 'All 12 pass.' })])
  })

  it('marks the conversation for review once it holds, and blocked where it was given up on', async () => {
    const ended = async (read: GoalRead): Promise<string | undefined> => {
      const built = build({
        disk: { list: async () => [], read: async () => undefined, has: async () => false, goal: async () => read },
      })
      const id = await started(built)
      built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
      await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
      built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
      await vi.waitFor(() => expect(of(built.rows, id)?.goal).toBeUndefined())
      return of(built.rows, id)?.status
    }
    expect(await ended({ ended: met, met: true })).toBe('review')
    expect(await ended({ ended: met })).toBe('blocked')
  })

  it('leaves a mark made by hand alone, since that one says what the person decided', async () => {
    let read: GoalRead = { goal: { condition, checks: 0 } }
    const built = build({
      disk: { list: async () => [], read: async () => undefined, has: async () => false, goal: async () => read },
    })
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: `/goal ${condition}` })
    built.sessions.mark(id, 'done')

    read = { ended: met, met: true }
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.goal).toBeUndefined())
    expect(of(built.rows, id)?.status).toBe('done')
  })
})

describe('a message sent while it works', () => {
  const more = (id: string, text: string, mode: SessionMode = 'manual') =>
    ({ session: id, root: ROOT, mode, text }) as const

  it('waits its turn, and each goes once the one before is answered, in the mode chosen by then', async () => {
    const built = build()
    const id = await started(built)
    await built.sessions.send(more(id, 'and the tests'))
    await built.sessions.send(more(id, 'then commit'))
    expect(built.fake.sent).toEqual([{ text: 'do the thing' }])
    expect(of(built.rows, id)?.queued).toEqual([
      { id: expect.any(String), text: 'and the tests', images: 0 },
      { id: expect.any(String), text: 'then commit', images: 0 },
    ])

    built.sessions.mode(id, 'auto')
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: 'and the tests' }))
    expect(of(built.rows, id)).toMatchObject({ state: 'working', mode: 'auto', queued: [{ text: 'then commit' }] })

    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: 'then commit' }))
    expect(of(built.rows, id)?.queued).toBeUndefined()
  })

  it('goes when the turn before it is stopped, one message and then the next', async () => {
    const built = build()
    const id = await started(built)
    await built.sessions.send(more(id, 'and the tests'))
    await built.sessions.send(more(id, 'then commit'))

    built.fake.hear({ signals: [{ kind: 'ended', how: 'stopped' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: 'and the tests' }))
    expect(of(built.rows, id)?.queued).toEqual([{ id: expect.any(String), text: 'then commit', images: 0 }])

    built.fake.hear({ signals: [{ kind: 'ended', how: 'stopped' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toEqual({ text: 'then commit' }))
    expect(of(built.rows, id)?.queued).toBeUndefined()
  })

  it('stays in the queue where the turn ended on its own, for the window to put back in the field', async () => {
    const built = build()
    const id = await started(built)
    await built.sessions.send(more(id, 'and the tests'))

    built.fake.hear({ signals: [{ kind: 'ended', how: 'failed' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.state).toBe('failed'))
    expect(built.fake.sent).toEqual([{ text: 'do the thing' }])
    expect(of(built.rows, id)?.queued).toEqual([{ id: expect.any(String), text: 'and the tests', images: 0 }])
  })

  it('can be cancelled before it goes, and is given back whole', async () => {
    const built = build()
    const id = await started(built)
    const picture = { media: 'image/png', data: 'AAAA' } as const
    await built.sessions.send({ ...more(id, 'look at this'), images: [picture] })
    const queued = of(built.rows, id)?.queued?.[0]
    expect(queued).toMatchObject({ text: 'look at this', images: 1 })
    expect(built.sessions.unqueue(id, queued?.id ?? '')).toMatchObject({ text: 'look at this', images: [picture] })
    expect(built.sessions.unqueue(id, queued?.id ?? '')).toBeUndefined()
    expect(of(built.rows, id)?.queued).toBeUndefined()

    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(of(built.rows, id)?.state).not.toBe('working'))
    expect(built.fake.sent).toEqual([{ text: 'do the thing' }])
  })

  it('can be said again in other words, keeping its place in the queue and its pictures', async () => {
    const built = build()
    const id = await started(built)
    const picture = { media: 'image/png', data: 'AAAA' } as const
    await built.sessions.send({ ...more(id, 'look at this'), images: [picture] })
    await built.sessions.send(more(id, 'then commit'))
    const first = of(built.rows, id)?.queued?.[0]

    built.sessions.requeue(id, first?.id ?? '', '  look at this instead  ')
    expect(of(built.rows, id)?.queued).toMatchObject([
      { id: first?.id, text: 'look at this instead', images: 1 },
      { text: 'then commit' },
    ])

    built.sessions.requeue(id, first?.id ?? '', '   ')
    expect(of(built.rows, id)?.queued?.[0]).toMatchObject({ text: 'look at this instead' })

    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(built.fake.sent.at(-1)).toMatchObject({ text: 'look at this instead', images: [picture] }))
  })

  it('can be started as a conversation of its own instead, in the same project and mode', async () => {
    const built = build()
    const id = await started(built)
    await built.sessions.send(more(id, 'and separately, look at the logs'))
    built.sessions.mode(id, 'auto')
    const queued = of(built.rows, id)?.queued?.[0]?.id ?? ''
    const other = await built.sessions.delegate(id, queued)
    expect(other).toBeDefined()
    expect(other).not.toBe(id)
    expect(built.fake.made.at(-1)).toMatchObject({ root: ROOT, id: other, resume: false, mode: 'auto' })
    expect(built.fake.sent.at(-1)).toEqual({ text: 'and separately, look at the logs' })
    expect(of(built.rows, id)).toMatchObject({ state: 'working' })
    expect(of(built.rows, id)?.queued).toBeUndefined()
    expect(await built.sessions.delegate(id, queued)).toBeUndefined()
  })

  it('does not queue /goal clear, which stops the turn instead', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send(more(id, '/goal the tests pass'))
    await built.sessions.send(more(id, '/goal clear'))
    expect(built.fake.stopped).toBe(1)
    expect(of(built.rows, id)?.queued).toBeUndefined()
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
    expect(await built.sessions.remove(['old'])).toEqual(['old'])
    expect(thrown).toEqual(['old'])
    expect(of(built.rows, 'old')).toBeUndefined()
    expect(await built.sessions.remove(['never-there'])).toEqual([])
  })

  it('stops the process of a conversation it deletes', async () => {
    const built = build({ disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    const id = await started(built)
    expect(await built.sessions.remove([id])).toEqual([])
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
    expect(await built.sessions.remove([id])).toEqual([id])
    expect(order).toEqual(['gone', 'deleted'])
  })

  it('deletes many at once and sends the list once', async () => {
    const built = build({
      disk: {
        list: async () => ['a', 'b', 'c'].map((id, at) => ({ id, title: id, stands: '', at, driven: false })),
        read: async () => undefined,
        has: async () => false,
        delete: async (_root, id) => id !== 'b',
      },
    })
    await built.sessions.list([ROOT])
    const sent = built.rows.length
    expect(await built.sessions.remove(['a', 'b', 'c'])).toEqual(['a', 'c'])
    expect(built.rows.length).toBe(sent + 1)
    expect(built.rows.at(-1)?.map((one) => one.id)).toEqual([])
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
        read: async () => ({ items: [], tasks: [], cost: 0.64 }),
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

describe('an answer nobody has read', () => {
  it('is marked on the row, and the mark is taken off without the conversation being opened', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    expect(of(built.rows, id)?.state).toBe('unread')

    built.sessions.read(id)
    expect(of(built.rows, id)?.state).toBe('idle')
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

describe('Claude Code options', () => {
  const REMOTE = 'https://claude.ai/code/session_remote'
  afterEach(() => vi.useRealTimers())

  it('turns Remote Control on, says where, and turns it on again in the next process', async () => {
    const built = build()
    built.fake.answers['remote_control'] = { session_url: REMOTE }
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    expect(await built.sessions.remote(id, true)).toEqual({ url: REMOTE })
    expect(built.fake.controls).toEqual([{ subtype: 'remote_control', enabled: true, name: 'do the thing' }])
    expect(of(built.rows, id)?.remote).toBe(REMOTE)

    // Plan is a new start, and Remote Control goes with the conversation into it.
    built.sessions.mode(id, 'plan')
    await built.sessions.send({ root: ROOT, session: id, mode: 'plan', text: 'plan it' })
    await Promise.resolve()
    expect(built.fake.made).toHaveLength(2)
    expect(built.fake.controls.filter((one) => one['enabled'] === true)).toHaveLength(2)
    expect(of(built.rows, id)?.remote).toBe(REMOTE)

    expect(await built.sessions.remote(id, false)).toEqual({})
    expect(built.fake.controls.at(-1)).toEqual({ subtype: 'remote_control', enabled: false })
    expect(of(built.rows, id)?.remote).toBeUndefined()
  })

  it('keeps the process while Remote Control is on, and lets it go once it is off', async () => {
    vi.useFakeTimers()
    const built = build()
    built.fake.answers['remote_control'] = { session_url: REMOTE }
    const id = await started(built)
    await built.sessions.remote(id, true)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    vi.advanceTimersByTime(11 * 60_000)
    expect(built.fake.ended).toBe(0)
    await built.sessions.remote(id, false)
    vi.advanceTimersByTime(11 * 60_000)
    expect(built.fake.ended).toBe(1)
  })

  it('starts a process for a conversation that has none, to turn Remote Control on in it', async () => {
    const built = build({
      disk: {
        list: async () => [{ id: 'old', title: 'An old one', stands: '', at: 1, driven: false }],
        read: async () => undefined,
        has: async () => true,
      },
    })
    built.fake.answers['remote_control'] = { session_url: REMOTE }
    await built.sessions.list([ROOT])
    expect(await built.sessions.remote('old', true)).toEqual({ url: REMOTE })
    expect(built.fake.made).toEqual([{ root: ROOT, id: 'old', resume: true, mode: 'auto' }])
    expect(built.fake.sent).toEqual([])
  })

  it('switches an MCP server in the process holding the conversation, then says how they stand', async () => {
    const asked: unknown[] = []
    const built = build({ mcp: async (...args) => (asked.push(args), []) })
    built.fake.answers['mcp_status'] = { mcpServers: [{ name: 'linear', status: 'disabled' }, { name: 'notion', status: 'connected' }] }
    const id = await started(built)
    expect(await built.sessions.mcp(ROOT, id, { name: 'linear', enabled: false })).toEqual([
      { name: 'linear', status: 'disabled' },
      { name: 'notion', status: 'connected' },
    ])
    expect(built.fake.controls).toEqual([
      { subtype: 'mcp_toggle', serverName: 'linear', enabled: false },
      { subtype: 'mcp_status' },
    ])
    expect(asked).toEqual([])
  })

  it('asks a process of its own about MCP where the conversation has none', async () => {
    const asked: unknown[] = []
    const built = build({ mcp: async (...args) => (asked.push(args), [{ name: 'linear', status: 'connected' }]) })
    expect(await built.sessions.mcp(ROOT, undefined, { name: 'linear', enabled: true })).toEqual([
      { name: 'linear', status: 'connected' },
    ])
    expect(asked).toEqual([[ROOT, { name: 'linear', enabled: true }]])
  })

  it('tells Claude Code the name a conversation was given, so a terminal and the phone show it too', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.rename(id, 'Azure migration')
    expect(built.fake.controls).toEqual([
      { subtype: 'rename_session', title: 'Azure migration', source: 'host', session_id: id },
    ])
  })

  it('tells it at the next start a name given while nothing held the conversation', async () => {
    const notes = memoryNotes()
    const built = build({ notes })
    const id = await started(built)
    notes.set(id, { ...notes.all()[id], title: 'Azure migration', renamed: true })
    built.fake.controls.length = 0

    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false }] })
    expect(built.fake.controls).toEqual([
      { subtype: 'rename_session', title: 'Azure migration', source: 'host', session_id: id },
    ])
  })

  it('leaves the name it gave itself alone, so the tool keeps its own title for a conversation nobody renamed', async () => {
    const built = build()
    await started(built)
    expect(built.fake.controls).toEqual([])
  })

  it('picks the Chrome to drive in the process holding the conversation, then says which they are', async () => {
    const asked: unknown[] = []
    const built = build({ browsers: async (...args) => (asked.push(args), []) })
    built.fake.answers['get_chrome_browsers'] = {
      browsers: [
        { device_id: 'work', name: 'Work', current: true },
        { device_id: 'mine', name: 'Personal' },
      ],
    }
    const id = await started(built)
    expect(await built.sessions.browsers(ROOT, id, 'mine')).toEqual([
      { id: 'work', name: 'Work', current: true },
      { id: 'mine', name: 'Personal', current: false },
    ])
    expect(built.fake.controls).toEqual([
      { subtype: 'select_chrome_browser', device_id: 'mine' },
      { subtype: 'get_chrome_browsers' },
    ])
    expect(asked).toEqual([])
  })

  it('asks a process of its own about Chrome where the conversation has none', async () => {
    const asked: unknown[] = []
    const built = build({ browsers: async (...args) => (asked.push(args), [{ id: 'work', name: 'Work', current: true }]) })
    expect(await built.sessions.browsers(ROOT, undefined, 'work')).toEqual([{ id: 'work', name: 'Work', current: true }])
    expect(asked).toEqual([[ROOT, 'work']])
  })
})

describe('commands typed after !', () => {
  /** A shell that prints what it is told to and ends when the test says. */
  function fakeShell(): { shell: typeof runShell; ran: string[]; print: (output: string) => void; end: (ran: Partial<Ran>) => void; stops: number } {
    const kept = { ran: [] as string[], stops: 0 }
    let heard: ((output: string) => void) | undefined
    let finish: ((ran: Ran) => void) | undefined
    const shell: typeof runShell = (_root, command, hear) => {
      kept.ran.push(command)
      heard = hear
      return {
        done: new Promise<Ran>((done) => (finish = done)),
        stop: () => {
          kept.stops += 1
          finish?.({ stdout: '', stderr: '', output: '', code: undefined, stopped: true })
        },
      }
    }
    return {
      shell,
      get ran() {
        return kept.ran
      },
      print: (output) => heard?.(output),
      end: (ran) => finish?.({ stdout: '', stderr: '', output: '', code: 0, stopped: false, ...ran }),
      get stops() {
        return kept.stops
      },
    }
  }
  const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

  it('runs one in the project, shows what it printed, and hands it to Claude with the next message', async () => {
    const shell = fakeShell()
    const built = build({ shell: shell.shell })
    const id = await built.sessions.shell({ root: ROOT, command: ' git status ' })
    expect(shell.ran).toEqual(['git status'])
    expect(of(built.rows, id)?.title).toBe('!git status')
    expect(built.fake.made).toEqual([])

    shell.end({ stdout: 'On branch main\n', output: 'On branch main\n' })
    await settle()
    const shown = last(built.fanned)?.items[0]
    expect(shown).toMatchObject({ kind: 'shell', command: 'git status', output: 'On branch main\n' })
    expect(shown).not.toHaveProperty('running')

    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'what changed?' })
    expect(built.fake.sent).toEqual([
      {
        text: 'what changed?',
        before: ['<bash-input>git status</bash-input>', '<bash-stdout>On branch main\n</bash-stdout><bash-stderr></bash-stderr>'],
      },
    ])
    expect(of(built.rows, id)?.title).toBe('what changed?')
    // Handed over once: the message after it goes alone.
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'and now?' })
    expect(built.fake.sent.at(-1)).toEqual({ text: 'and now?' })
  })

  it('shows the conversation as working while one runs, and says which', async () => {
    const shell = fakeShell()
    const built = build({ shell: shell.shell })
    const id = await built.sessions.shell({ root: ROOT, command: 'npm test' })
    expect(of(built.rows, id)).toMatchObject({ state: 'idle', runs: 'npm test', stands: 'Running !npm test' })

    shell.end({ output: 'ok\n' })
    await settle()
    expect(of(built.rows, id)).not.toHaveProperty('runs')
    expect(of(built.rows, id)?.stands).not.toBe('Running !npm test')
  })

  it('stops one that is still running', async () => {
    const shell = fakeShell()
    const built = build({ shell: shell.shell })
    const id = await built.sessions.shell({ root: ROOT, command: 'npm run dev' })
    const item = built.fanned[0]?.items[0]
    built.sessions.stopShell(id, item?.id ?? '')
    await settle()
    expect(shell.stops).toBe(1)
    expect(last(built.fanned)?.items[0]).toMatchObject({ kind: 'shell', stopped: true })
  })

  it('opens one that wants a keyboard in a terminal instead, waits for it there, and tells Claude how it ended', async () => {
    const shell = fakeShell()
    const opened: [string, string][] = []
    const built = build({ shell: shell.shell, terminal: (root, command) => opened.push([root, command]) })
    const id = await built.sessions.shell({ root: ROOT, command: 'gh auth login' })
    expect(shell.ran).toEqual([])
    expect(built.fanned[0]?.items[0]).toMatchObject({ kind: 'shell', terminal: true, running: true })

    const [root, typed] = opened[0] ?? []
    expect(root).toBe(ROOT)
    const status = /^gh auth login; echo \$\? > "(.+)"$/.exec(typed ?? '')?.[1]
    expect(status).toBeDefined()
    await writeFile(status ?? '', '1\n')
    await vi.waitFor(() => expect(last(built.fanned)?.items[0]).not.toHaveProperty('running'), { timeout: 3000 })
    expect(last(built.fanned)?.items[0]).toMatchObject({ kind: 'shell', terminal: true, code: 1, output: '' })

    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'did it work?' })
    expect(built.fake.sent[0]?.before).toEqual([
      '<bash-input>gh auth login</bash-input>',
      '<bash-stdout>It ran in a terminal window, since it wants a keyboard, and what it printed stayed there.</bash-stdout><bash-stderr>Exit code 1</bash-stderr>',
    ])
  })
})

describe('what runs in the background', () => {
  afterEach(() => vi.useRealTimers())

  const task = { id: 'b1', kind: 'local_bash', what: 'npm run dev', status: 'running', started: 1 } as const
  const done = { ...task, status: 'completed', ended: 2, exit: 0 } as const

  it('shows a turn the tool began by itself as working, and says when it is done', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    built.fake.hear({ signals: [{ kind: 'begun' }, { kind: 'started', session: id, key: false }] })
    expect(of(built.rows, id)?.state).toBe('working')
    built.fake.hear({ signals: [{ kind: 'said', text: 'It printed ready' }, { kind: 'ended', how: 'done' }] })
    expect(of(built.rows, id)?.state).toBe('unread')
    expect(built.notes.at(-1)).toMatchObject({ title: 'Finished - app', body: 'It printed ready' })
  })

  it('lists what runs in the background, keeps the process for it, and lets it go once nothing is left running', async () => {
    vi.useFakeTimers()
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'task', task }, { kind: 'ended', how: 'done' }] })
    expect(of(built.rows, id)?.tasks).toEqual([task])
    vi.advanceTimersByTime(11 * 60_000)
    expect(built.fake.ended).toBe(0)
    built.fake.hear({ signals: [{ kind: 'task', task: done }] })
    expect(of(built.rows, id)?.tasks).toEqual([done])
    vi.advanceTimersByTime(11 * 60_000)
    expect(built.fake.ended).toBe(1)
    // What ended stays to be read until it is cleared, as in the terminal's /tasks.
    expect(of(built.rows, id)?.tasks).toEqual([done])
    built.sessions.clearTask(id, 'b1')
    expect(of(built.rows, id)?.tasks).toBeUndefined()
  })

  it('clears only what has ended', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'task', task }] })
    built.sessions.clearTask(id, 'b1')
    expect(of(built.rows, id)?.tasks).toEqual([task])
  })

  it('reads what a helper in the background has said and done', async () => {
    const built = build()
    const id = await started(built)
    const output = join(import.meta.dirname, 'fixtures', 'claude-helper-transcript.jsonl')
    built.fake.hear({ signals: [{ kind: 'task', task: { ...task, id: 'a1', kind: 'local_agent', output } }] })
    const read = await built.sessions.taskOutput(id, 'a1')
    expect(read?.kind === 'helper' ? read.lines.map((line) => line.who) : []).toEqual(['asked', 'did', 'did', 'said'])
    expect(await built.sessions.taskOutput(id, 'nothing')).toBeUndefined()
  })

  it('sends a command on in the background, and stops a task, over the control channel', async () => {
    const built = build()
    const id = await started(built)
    built.sessions.toBackground(id, 'toolu_1')
    built.sessions.stopTask(id, 'b1')
    expect(built.fake.controls).toEqual([
      { subtype: 'background_tasks', tool_use_id: 'toolu_1' },
      { subtype: 'stop_task', task_id: 'b1' },
    ])
  })

  it('counts what ran in the background as stopped when the process is started again for another model', async () => {
    const built = build()
    const id = await started(built)
    built.fake.hear({ signals: [{ kind: 'task', task }, { kind: 'ended', how: 'done' }] })
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', model: 'sonnet', text: 'again' })
    expect(built.fake.made).toHaveLength(2)
    expect(of(built.rows, id)?.tasks).toEqual([{ ...task, status: 'stopped', ended: expect.any(Number) }])
  })
})

describe('marking a conversation', () => {
  it('shows the tracker item it began with and the mark, and saying more takes the mark off', async () => {
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'Review https://github.com/twins-ai/Twins-AI/pull/3908' })
    built.fake.hear({ signals: [{ kind: 'started', session: id, key: false }] })
    expect(of(built.rows, id)?.work).toMatchObject({ label: '#3908', says: 'twins-ai/Twins-AI pull request 3908' })
    built.fake.hear({ signals: [{ kind: 'ended', how: 'done' }] })
    built.sessions.mark(id, 'review')
    expect(of(built.rows, id)?.status).toBe('review')
    built.sessions.mark(id, undefined)
    expect(of(built.rows, id)?.status).toBeUndefined()
    built.sessions.mark(id, 'done')
    expect(of(built.rows, id)?.status).toBe('done')
    await built.sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'One more thing' })
    expect(of(built.rows, id)?.status).toBeUndefined()
  })

  it('takes the tracker item of one listed from disk', async () => {
    const work = { label: 'FOR-1067', url: 'https://linear.app/formula/issue/FOR-1067', says: 'FOR-1067' }
    const built = build({
      disk: { list: async () => [{ id: 'listed', title: 'Listed', stands: '', at: 1, driven: false, work }], read: async () => undefined, has: async () => false },
    })
    const all = await built.sessions.list([ROOT])
    expect(all.find((one) => one.id === 'listed')?.work).toEqual(work)
  })
})
