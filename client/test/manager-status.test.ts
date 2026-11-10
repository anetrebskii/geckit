import { describe, expect, it } from 'vitest'

import { StatusMessage, threadActivity } from '../src/main/manager-status'
import type { StatusPoster, ThreadActivity } from '../src/main/manager-status'
import type { ChatSession } from '../src/shared/api'
import type { ManagerThread, ManagerView } from '../src/shared/manager'

const worker = (id: string, title: string, extra: Partial<ChatSession> = {}): ChatSession => ({ id, title, state: 'idle', stands: '', ...extra }) as ChatSession
const thread = (extra: Partial<ManagerThread> = {}): ManagerThread => ({ id: 'slack:C1:3.0', title: 'Fix it', labels: {}, state: 'idle', at: 0, owns: [], ...extra }) as ManagerThread
const view = (threads: ManagerThread[], workers: ChatSession[] = [], decisions: ManagerView['decisions'] = []): ManagerView => ({ state: 'idle', config: {}, workers, activity: [], providers: [], decisions, queued: 0, threads }) as unknown as ManagerView

describe('threadActivity', () => {
  it('says Manager is waiting, stopped or that work is in progress, and whether Manager itself is busy', () => {
    expect(threadActivity(view([thread({ manager: 'received' })]), 'slack:C1:3.0')).toMatchObject({ manager: 'While I wait, here is what is going on:', active: true })
    expect(threadActivity(view([thread({ manager: 'working' })]), 'slack:C1:3.0')).toMatchObject({ active: true })
    expect(threadActivity(view([thread()], [], [{ id: 'd', title: 'Go?', choices: [], thread: 'slack:C1:3.0' } as unknown as ManagerView['decisions'][number]]), 'slack:C1:3.0')).toEqual({ manager: 'Waiting for your answer above.', ending: 'Waiting for your answer above.', active: false, workers: [] })
    expect(threadActivity(view([thread({ state: 'failed', error: `Usage limit reached\nstack ${'x'.repeat(300)}` })]), 'slack:C1:3.0')).toMatchObject({ manager: "I can't go on: Usage limit reached", ending: "I can't go on: Usage limit reached", active: false })
    expect(threadActivity(view([thread()]), 'slack:C1:3.0')).toMatchObject({ manager: 'While I wait, here is what is going on:', ending: 'Done.', active: false })
  })

  it('lists only the workers this thread tracks, with states, what they are doing and no secrets', () => {
    const workers = [
      worker('w1', 'Fix login', { state: 'working', stands: 'Running the redirect tests\nmore' }),
      worker('w2', 'Deploy with token xoxb-1234567890-abcdefghij', { state: 'asks' }),
      worker('w3', 'Queued one', { waits: true }),
      worker('w4', 'Failed one', { state: 'failed', stands: 'token xoxb-1234567890-abcdefghij' }),
      worker('w5', 'Pending one', { delivery: { status: 'pending' } } as Partial<ChatSession>),
      worker('other', 'Someone else', { state: 'working' }),
    ]
    const activity = threadActivity(view([thread({ owns: ['w1', 'w2', 'w4', 'w3', 'w5'] }), thread({ id: 'telegram:81', owns: ['other'] })], workers), 'slack:C1:3.0')
    expect(activity?.workers).toEqual([
      { id: 'w1', line: '• Fix login: working\n  Running the redirect tests', active: true },
      { id: 'w2', line: '• a task: waiting for an answer in GeckIt', active: false },
      { id: 'w4', line: '• Failed one: stopped with an error', active: false },
      { id: 'w3', line: '• Queued one: waiting for a free slot', active: true },
      { id: 'w5', line: '• Pending one: message sent, not started yet', active: true },
    ])
  })

  it('keeps a worker active while its background tasks run, and lists them', () => {
    const task = (id: string, what: string, status: 'running' | 'asks' | 'completed'): NonNullable<ChatSession['tasks']>[number] => ({ id, kind: 'monitor', what, status, started: 0 })
    const watching = worker('w1', 'Watch CI', { tasks: [task('a', 'CI run 42', 'running'), task('b', 'Old build', 'completed'), task('c', 'Deploy check', 'asks'), task('d', 'D', 'running'), task('e', 'E', 'running')] })
    expect(threadActivity(view([thread({ owns: ['w1'] })], [watching]), 'slack:C1:3.0')?.workers).toEqual([
      { id: 'w1', line: '• Watch CI: running in the background\n  - CI run 42: running\n  - Deploy check: waiting for an answer\n  - D: running\n  - and 1 more in the background', active: true },
    ])
  })

  it('says nothing for a closed or unknown thread', () => {
    expect(threadActivity(view([thread({ closed: 'Slack thread deleted' } as Partial<ManagerThread>)]), 'slack:C1:3.0')).toBeUndefined()
    expect(threadActivity(view([]), 'slack:C1:3.0')).toBeUndefined()
  })
})

function poster(): { calls: string[]; fail: { post: boolean; edit: boolean }; poster: StatusPoster } {
  const calls: string[] = []
  const fail = { post: false, edit: false }
  let id = 0
  return {
    calls,
    fail,
    poster: {
      post: async (text) => { if (fail.post) { fail.post = false; throw new Error('post failed') } calls.push(`post ${text}`); return String(++id) },
      edit: async (at, text) => { if (fail.edit) { fail.edit = false; throw new Error('edit failed') } calls.push(`edit ${at} ${text}`) },
      remove: async (at) => { calls.push(`remove ${at}`) },
    },
  }
}

const settle = async (): Promise<void> => { for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0)) }
const busy = (workers: ThreadActivity['workers'] = []): ThreadActivity => ({ manager: 'While I wait, here is what is going on:', ending: 'Done.', active: true, workers })
const free = (workers: ThreadActivity['workers'] = []): ThreadActivity => ({ manager: 'While I wait, here is what is going on:', ending: 'Done.', active: false, workers })
const fix = (line: string, active = true): ThreadActivity['workers'][number] => ({ id: 'w1', line: `• Fix: ${line}`, active })

describe('StatusMessage', () => {
  it('shows while Manager is free and workers run, edits real changes no sooner than the gap, and ends with the outcome', async () => {
    let clock = Date.UTC(2026, 10, 6, 14, 32)
    const waits: number[] = []
    const { calls, poster: send } = poster()
    const status = new StatusMessage(send, { now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms } })
    status.update(free())
    status.update(busy())
    await settle()
    expect(calls).toEqual([])
    status.update(busy([fix('working')]))
    await settle()
    expect(calls).toEqual([])
    status.update(free([fix('working')]))
    await settle()
    status.update(free([fix('working')]))
    status.update(free([fix('still working')]))
    await settle()
    status.update(free([fix('finished', false), { id: 'w2', line: '• Never active: finished', active: false }]))
    await settle()
    expect(calls).toEqual([
      'post While I wait, here is what is going on:\n• Fix: working\nUpdated 14:32 UTC',
      'edit 1 While I wait, here is what is going on:\n• Fix: still working\nUpdated 14:32 UTC',
      'edit 1 Done.\n• Fix: finished\nUpdated 14:32 UTC',
    ])
    expect(waits).toEqual([3000, 3000])
    status.update(free([fix('working')]))
    await settle()
    expect(calls.at(-1)).toBe('post While I wait, here is what is going on:\n• Fix: working\nUpdated 14:32 UTC')
  })

  it('goes away while Manager works on a message and comes back below what Manager sends', async () => {
    const { calls, poster: send } = poster()
    const status = new StatusMessage(send, { gap: 0, now: () => Date.UTC(2026, 10, 6, 14, 32) })
    status.update(free([fix('working')]))
    await settle()
    status.update(busy([fix('working')]))
    await settle()
    expect(calls).toEqual(['post While I wait, here is what is going on:\n• Fix: working\nUpdated 14:32 UTC', 'remove 1'])
    let sent = (): void => undefined
    status.after(new Promise<void>((resolve) => { sent = resolve }))
    status.update(free([fix('working')]))
    await settle()
    expect(calls).toHaveLength(2)
    sent()
    await settle()
    expect(calls.at(-1)).toBe('post While I wait, here is what is going on:\n• Fix: working\nUpdated 14:32 UTC')
    status.after(Promise.resolve())
    await settle()
    expect(calls.slice(-2)).toEqual(['remove 2', 'post While I wait, here is what is going on:\n• Fix: working\nUpdated 14:32 UTC'])
    status.update(busy([fix('finished', false)]))
    status.update(free([fix('finished', false)]))
    await settle()
    expect(calls.at(-1)).toBe('remove 3')
  })

  it('caps the worker lines and keeps an ending for a stretch that waits for an answer', async () => {
    const { calls, poster: send } = poster()
    const status = new StatusMessage(send, { gap: 0 })
    const workers = Array.from({ length: 10 }, (_, at) => ({ id: `w${String(at)}`, line: `• W${String(at)}: working`, active: true }))
    status.update(free(workers))
    await settle()
    expect(calls[0]?.split('\n').slice(-3, -1)).toEqual(['• W7: working', 'and 2 more'])
    status.update({ manager: 'Waiting for your answer above.', ending: 'Waiting for your answer above.', active: false, workers: [] })
    await settle()
    expect(calls.at(-1)).toMatch(/^edit 1 Waiting for your answer above\.\n/)
  })

  it('tries again on the next change after a failure, and starts over when the first post failed', async () => {
    const failures: unknown[] = []
    const { calls, fail, poster: send } = poster()
    const status = new StatusMessage(send, { gap: 0, failed: (error) => failures.push(error), now: () => Date.UTC(2026, 10, 6, 14, 32) })
    fail.post = true
    status.update(free([fix('working')]))
    await settle()
    expect(calls).toEqual([])
    status.update(free([fix('still')]))
    await settle()
    expect(calls).toEqual(['post While I wait, here is what is going on:\n• Fix: still\nUpdated 14:32 UTC'])
    fail.edit = true
    status.update(free([fix('again')]))
    await settle()
    status.update(free([fix('later')]))
    await settle()
    expect(calls.at(-1)).toBe('edit 1 While I wait, here is what is going on:\n• Fix: later\nUpdated 14:32 UTC')
    expect(failures).toHaveLength(2)
  })
})
