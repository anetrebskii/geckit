import { describe, expect, it } from 'vitest'

import { answerLines, tasksFrom } from '../src/cli/start'
import type { holdClaude } from '../src/main/sessions/claude'
import type { Driver } from '../src/main/sessions/heard'
import { memoryNotes, Sessions, startsConversations } from '../src/main/sessions'
import type { Asking, SessionNotice } from '../src/main/sessions'
import type { ChatSession, SessionItem, SessionItems } from '../src/shared/api'

/**
 * Conversations Claude asks GeckIt to start with `geckit start`: shown in the
 * conversation that asked, started only as the person answers, and answered
 * back to the command as one.
 */

const ROOT = '/work/app'
const OTHER = '/work/other'

function build(limit = 0): {
  readonly sessions: Sessions
  readonly sent: string[]
  readonly rows: (readonly ChatSession[])[]
  readonly fanned: SessionItems[]
  readonly notices: SessionNotice[]
  readonly answered: [string, string][]
  hear: (ask: string, command: string) => void
} {
  const sent: string[] = []
  const answered: [string, string][] = []
  let heard: Parameters<typeof holdClaude>[1] | undefined
  const claude: typeof holdClaude = (_options, hear) => {
    heard = hear
    const driver: Driver = {
      send: (text) => sent.push(text),
      answer: (ask, answer) => answered.push([ask, String(answer)]),
      permit: () => undefined,
      control: async () => ({}),
      stop: () => undefined,
      end: () => Promise.resolve(),
    }
    return driver
  }
  const rows: (readonly ChatSession[])[] = []
  const fanned: SessionItems[] = []
  const notices: SessionNotice[] = []
  const sessions = new Sessions({
    notes: memoryNotes(),
    changed: (all) => rows.push(all),
    items: (said) => fanned.push(said),
    account: () => undefined,
    notify: (notice) => notices.push(notice),
    claude,
    disk: { list: async () => [], read: async () => undefined, has: async () => false },
    claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }),
    claudeModels: async () => undefined,
    claudeProgram: async () => undefined,
    usage: async () => ({ windows: new Map() }),
    now: () => 1_000,
    limit: () => limit,
  })
  const hear = (ask: string, command: string): void =>
    heard?.({ items: [], gone: [], signals: [{ kind: 'asks', ask, wanted: { kind: 'command', command } }] })
  return { sessions, sent, rows, fanned, notices, answered, hear }
}

const TASKS: Asking[] = [
  { project: 'app', root: ROOT, title: 'Fix the flaky test', text: 'Fix the flaky upload test.', goal: 'npm test passes' },
  { project: 'other', root: OTHER, title: 'Honour Retry-After', text: 'Honour Retry-After on 429.' },
]

const row = (rows: readonly (readonly ChatSession[])[], id: string): ChatSession | undefined => rows.at(-1)?.find((one) => one.id === id)
const request = (fanned: readonly SessionItems[]): Extract<SessionItem, { kind: 'request' }> | undefined =>
  fanned
    .flatMap((one) => one.items)
    .filter((item) => item.kind === 'request')
    .at(-1)

describe('a request to start conversations', () => {
  it('waits in the conversation that asked, and says so on its row and in a notice', async () => {
    const built = build()
    const asker = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'look around' })
    void built.sessions.request(asker, TASKS, 'auto', new AbortController().signal)
    expect(request(built.fanned)).toMatchObject({ tasks: [{ title: 'Fix the flaky test' }, { title: 'Honour Retry-After' }] })
    expect(request(built.fanned)?.answer).toBeUndefined()
    expect(row(built.rows, asker)).toMatchObject({ state: 'asks', stands: 'Wants to start 2 conversations' })
    expect(built.notices.at(-1)).toMatchObject({
      session: asker,
      title: 'Wants to start 2 conversations - app, other',
      asks: true,
      request: request(built.fanned)?.id,
    })
    expect(built.sessions.wanting()).toBe(1)
  })

  it('starts the ticked tasks with their notes and goals, refuses the rest, and answers all of them at once', async () => {
    const built = build()
    const asker = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'look around' })
    const answer = built.sessions.request(asker, TASKS, 'auto', new AbortController().signal)
    const id = request(built.fanned)?.id ?? ''
    await built.sessions.answerRequest(id, { start: [true, false], notes: ['use the fixture', 'ignored'], reply: 'later', where: 'mac' })
    const said = await answer
    expect(said?.tasks[0]).toMatchObject({ answer: 'started', note: 'use the fixture' })
    expect(said?.tasks[1]).toEqual({ answer: 'refused' })
    expect(said?.reply).toBe('later')
    expect(built.sent).toContain('Fix the flaky upload test.\n\nNote: use the fixture')
    const child = said?.tasks[0]?.id ?? ''
    expect(row(built.rows, child)?.goal?.condition).toBe('npm test passes')
    expect(row(built.rows, child)?.parent).toBe(asker)
    expect(row(built.rows, asker)?.state).not.toBe('asks')
    expect(request(built.fanned)).toMatchObject({
      answer: { how: 'answered', where: 'mac', reply: 'later' },
      tasks: [{ started: child, note: 'use the fixture' }, { title: 'Honour Retry-After' }],
    })
    expect(request(built.fanned)?.tasks[1]?.started).toBeUndefined()
  })

  it('begins the ticked tasks as conversations waiting for a slot where as many are working as the limit, and says so to the command', async () => {
    const built = build(1)
    const asker = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'look around' })
    const answer = built.sessions.request(asker, TASKS, 'auto', new AbortController().signal)
    await built.sessions.answerRequest(request(built.fanned)?.id ?? '', { start: [true, false], notes: [], where: 'mac' })
    const said = await answer
    const child = said?.tasks[0]?.id ?? ''
    expect(said?.tasks).toEqual([{ answer: 'queued', id: child }, { answer: 'refused' }])
    expect(built.sent).toEqual(['look around'])
    expect(row(built.rows, child)).toMatchObject({ waits: true, parent: asker, queued: [{ text: 'Fix the flaky upload test.' }, { text: '/goal npm test passes' }] })
    expect(request(built.fanned)?.tasks[0]).toMatchObject({ started: child })
  })

  it('is withdrawn when the command stops waiting, and nothing starts', async () => {
    const built = build()
    const asker = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'look around' })
    const gone = new AbortController()
    const answer = built.sessions.request(asker, TASKS, 'auto', gone.signal)
    gone.abort()
    expect(await answer).toBeUndefined()
    expect(request(built.fanned)?.answer).toEqual({ how: 'withdrawn' })
    expect(row(built.rows, asker)?.state).not.toBe('asks')
    await built.sessions.startAll(request(built.fanned)?.id ?? '', 'mac')
    expect(built.sent).toEqual(['look around'])
  })

  it('lets GeckIt own start command through without a card', async () => {
    const built = build()
    await built.sessions.send({ root: ROOT, mode: 'manual', text: 'look around' })
    built.hear('ask-1', '~/.geckit/bin/geckit start --tasks tasks.json')
    expect(built.answered).toEqual([['ask-1', 'once']])
  })
})

describe('which commands are GeckIt asking', () => {
  it.each([
    '~/.geckit/bin/geckit start --project app "Fix it"',
    '/Users/alex/.geckit/bin/geckit start --tasks tasks.json',
    '~/.geckit/bin/geckit-local start --project app "Fix it"',
    "~/.geckit/bin/geckit start --tasks - <<'EOF'\n[{\"project\": \"app\", \"text\": \"a; b\"}]\nEOF",
  ])('lets through %s', (command) => expect(startsConversations(command)).toBe(true))

  it.each([
    '~/.geckit/bin/geckit start --project app x && rm -rf ~',
    '~/.geckit/bin/geckit start --project app $(whoami)',
    "~/.geckit/bin/geckit start --tasks - <<'EOF'\n[]\nEOF\nrm -rf ~\nEOF",
    '~/.geckit/bin/geckit sessions',
    'geckit start --project app x',
  ])('asks about %s', (command) => expect(startsConversations(command)).toBe(false))
})

describe('geckit start', () => {
  it('reads one task from its flags', () => {
    expect(tasksFrom(['--project', 'app', '--goal', 'tests pass', 'Fix', 'it'], () => '')).toEqual([
      { project: 'app', text: 'Fix it', goal: 'tests pass' },
    ])
  })

  it('reads a batch from a file and says what is wrong with one', () => {
    expect(tasksFrom(['--tasks', 'x.json'], () => '[{"project":"app","text":"a"},{"project":"app","text":" "}]')).toBe('Task 2 has no text.')
    expect(tasksFrom(['--tasks', 'x.json'], () => JSON.stringify(Array(21).fill({ project: 'a', text: 'b' })))).toBe('At most 20 tasks at once.')
    expect(tasksFrom(['--tasks', '-'], () => '{')).toBe('stdin is not a JSON array of tasks.')
  })

  it('prints a line per task in the order sent, then the reply', () => {
    const answer = { ok: true, tasks: [{ answer: 'started' as const, id: 'abc', note: 'n' }, { answer: 'refused' as const }], reply: 'r' }
    expect(answerLines(answer, false)).toBe('1 Started abc: n\n2 Refused\nReply: r')
    expect(JSON.parse(answerLines(answer, true))).toEqual({
      tasks: [
        { task: 1, answer: 'started', id: 'abc', note: 'n' },
        { task: 2, answer: 'refused' },
      ],
      reply: 'r',
    })
  })
})
