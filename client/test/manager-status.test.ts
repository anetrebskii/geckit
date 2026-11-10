import { describe, expect, it } from 'vitest'

import { StatusMessage, threadActivity } from '../src/main/manager-status'
import type { ThreadActivity } from '../src/main/manager-status'
import type { ChatSession } from '../src/shared/api'
import type { ManagerThread, ManagerView } from '../src/shared/manager'

const worker = (id: string, title: string, extra: Partial<ChatSession> = {}): ChatSession => ({ id, title, state: 'idle', ...extra }) as ChatSession
const thread = (extra: Partial<ManagerThread> = {}): ManagerThread => ({ id: 'slack:C1:3.0', title: 'Fix it', labels: {}, state: 'idle', at: 0, owns: [], ...extra }) as ManagerThread
const view = (threads: ManagerThread[], workers: ChatSession[] = [], decisions: ManagerView['decisions'] = []): ManagerView => ({ state: 'idle', config: {}, workers, activity: [], providers: [], decisions, queued: 0, threads }) as unknown as ManagerView

describe('threadActivity', () => {
  it('tells accepted apart from started, and Manager waiting, stopped and done', () => {
    expect(threadActivity(view([thread({ manager: 'received' })]), 'slack:C1:3.0')).toMatchObject({ manager: 'Manager has your message and has not started yet.', active: true })
    expect(threadActivity(view([thread({ manager: 'working' })]), 'slack:C1:3.0')).toMatchObject({ manager: 'Manager is working on it.', active: true })
    expect(threadActivity(view([thread()], [], [{ id: 'd', title: 'Go?', choices: [], thread: 'slack:C1:3.0' } as unknown as ManagerView['decisions'][number]]), 'slack:C1:3.0')).toEqual({ manager: 'Manager is waiting for your answer above.', ending: 'Waiting for your answer above.', active: false, workers: [] })
    expect(threadActivity(view([thread({ state: 'failed', error: `Usage limit reached\nstack ${'x'.repeat(300)}` })]), 'slack:C1:3.0')).toMatchObject({ manager: 'Manager stopped: Usage limit reached', ending: 'Manager stopped: Usage limit reached', active: false })
    expect(threadActivity(view([thread()]), 'slack:C1:3.0')).toMatchObject({ manager: 'Manager is done for now.', ending: 'Done.', active: false })
  })

  it('lists only the workers this thread tracks, with states and no secrets', () => {
    const workers = [
      worker('w1', 'Fix login', { state: 'working' }),
      worker('w2', 'Deploy with token xoxb-1234567890-abcdefghij', { state: 'asks' }),
      worker('w3', 'Queued one', { waits: true }),
      worker('w4', 'Failed one', { state: 'failed' }),
      worker('w5', 'Pending one', { delivery: { status: 'pending' } } as Partial<ChatSession>),
      worker('other', 'Someone else', { state: 'working' }),
    ]
    const activity = threadActivity(view([thread({ owns: ['w1', 'w2', 'w4', 'w3', 'w5'] }), thread({ id: 'telegram:81', owns: ['other'] })], workers), 'slack:C1:3.0')
    expect(activity?.workers).toEqual([
      { id: 'w1', line: '• Fix login: working', active: true },
      { id: 'w2', line: '• a task: waiting for an answer in GeckIt', active: false },
      { id: 'w4', line: '• Failed one: stopped with an error', active: false },
      { id: 'w3', line: '• Queued one: waiting for a free slot', active: true },
      { id: 'w5', line: '• Pending one: message sent, not started yet', active: true },
    ])
  })

  it('says nothing for a closed or unknown thread', () => {
    expect(threadActivity(view([thread({ closed: 'Slack thread deleted' } as Partial<ManagerThread>)]), 'slack:C1:3.0')).toBeUndefined()
    expect(threadActivity(view([]), 'slack:C1:3.0')).toBeUndefined()
  })
})

function poster(): { calls: string[]; fail: { post: boolean; edit: boolean }; poster: { post(text: string): Promise<string>; edit(id: string, text: string): Promise<void> } } {
  const calls: string[] = []
  const fail = { post: false, edit: false }
  let id = 0
  return {
    calls,
    fail,
    poster: {
      post: async (text) => { if (fail.post) { fail.post = false; throw new Error('post failed') } calls.push(`post ${text}`); return String(++id) },
      edit: async (at, text) => { if (fail.edit) { fail.edit = false; throw new Error('edit failed') } calls.push(`edit ${at} ${text}`) },
    },
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const live = (manager: string, workers: ThreadActivity['workers'] = []): ThreadActivity => ({ manager, ending: 'Done.', active: true, workers })
const idle = (workers: ThreadActivity['workers'] = []): ThreadActivity => ({ manager: 'Manager is done for now.', ending: 'Done.', active: false, workers })

describe('StatusMessage', () => {
  it('posts once per stretch, edits only real changes no sooner than the gap, and ends with the outcome', async () => {
    let clock = Date.UTC(2026, 10, 6, 14, 32)
    const waits: number[] = []
    const { calls, poster: send } = poster()
    const status = new StatusMessage(send, { now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms } })
    status.update(idle())
    await settle()
    expect(calls).toEqual([])
    status.update(live('Manager has your message and has not started yet.'))
    await settle()
    status.update(live('Manager has your message and has not started yet.'))
    status.update(live('Manager is working on it.', [{ id: 'w1', line: '• Fix: working', active: true }]))
    await settle()
    status.update(idle([{ id: 'w1', line: '• Fix: finished', active: false }, { id: 'w2', line: '• Never active: finished', active: false }]))
    await settle(); await settle()
    expect(calls).toEqual([
      'post Manager has your message and has not started yet.',
      'edit 1 Manager is working on it.\n• Fix: working',
      'edit 1 Done.\n• Fix: finished\nUpdated 14:32 UTC',
    ])
    expect(waits).toEqual([3000, 3000])
    status.update(live('Manager has your message and has not started yet.'))
    await settle()
    expect(calls.at(-1)).toBe('post Manager has your message and has not started yet.')
  })

  it('caps the worker lines and keeps an ending for a stretch that waits for an answer', async () => {
    const { calls, poster: send } = poster()
    const status = new StatusMessage(send, { gap: 0 })
    const workers = Array.from({ length: 10 }, (_, at) => ({ id: `w${String(at)}`, line: `• W${String(at)}: working`, active: true }))
    status.update(live('Manager is working on it.', workers))
    await settle()
    expect(calls[0]?.split('\n').slice(-2)).toEqual(['• W7: working', 'and 2 more'])
    status.update({ manager: 'Manager is waiting for your answer above.', ending: 'Waiting for your answer above.', active: false, workers: [] })
    await settle(); await settle()
    expect(calls.at(-1)).toMatch(/^edit 1 Waiting for your answer above\.\n/)
  })

  it('tries again on the next change after a failure, and starts over when the first post failed', async () => {
    const failures: unknown[] = []
    const { calls, fail, poster: send } = poster()
    const status = new StatusMessage(send, { gap: 0, failed: (error) => failures.push(error) })
    fail.post = true
    status.update(live('Manager is working on it.'))
    await settle()
    expect(calls).toEqual([])
    status.update(live('Manager is working on it.', [{ id: 'w1', line: '• Fix: working', active: true }]))
    await settle()
    expect(calls).toEqual(['post Manager is working on it.\n• Fix: working'])
    fail.edit = true
    status.update(live('Manager is done for now.', [{ id: 'w1', line: '• Fix: working', active: true }]))
    await settle(); await settle()
    status.update(live('Manager is done for now.', [{ id: 'w1', line: '• Fix: still', active: true }]))
    await settle(); await settle()
    expect(calls.at(-1)).toBe('edit 1 Manager is done for now.\n• Fix: still')
    expect(failures).toHaveLength(2)
  })
})
