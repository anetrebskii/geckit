import { describe, expect, it } from 'vitest'
import { groupUpdates, isMilestone, mergeUpdates, shouldCompact, taskLabel, updateLine, validCompactAt } from '../src/main/manager-economy'
import type { Before, Observed } from '../src/main/manager-economy'
import type { BackgroundTask } from '../src/shared/api'

const task = (id: string, status: BackgroundTask['status'], command = 'sleep 20; done'): BackgroundTask => ({ id, kind: 'local_bash', what: '', command, status, started: 1 })
const worker = (change: Partial<Observed> = {}): Observed => ({ id: 'w1', title: 'Leads', root: '/p', state: 'working', status: 'progress', stands: 'Searching', tasks: [], ...change }) as Observed
const before = (state: string, tasks: readonly [string, string][] = [], goalMet: unknown = null): Before => ({ state, goalMet, tasks: new Map(tasks) })

describe('isMilestone', () => {
  it('ignores a background command that ends while the worker keeps working', () => {
    expect(isMilestone(worker({ tasks: [task('t1', 'completed')] }), before('working', [['t1', 'running']]), 0)).toBe(false)
  })

  it('wakes for a background command that asks', () => {
    expect(isMilestone(worker({ tasks: [task('t1', 'asks')] }), before('working', [['t1', 'running']]), 0)).toBe(true)
  })

  it('wakes when a command ends after the worker stopped', () => {
    expect(isMilestone(worker({ state: 'idle', tasks: [task('t1', 'completed')] }), before('idle', [['t1', 'running']]), 0)).toBe(true)
  })

  it.each([
    ['finished', worker({ state: 'idle' }), before('working')],
    ['failed', worker({ state: 'failed' }), before('working')],
    ['blocked', worker({ status: 'blocked' }), before('working')],
    ['unread', worker({ state: 'unread' }), before('working')],
    ['goal result', worker({ goalMet: 'Tests pass' }), before('working')],
  ])('wakes when the worker %s', (_name, now, was) => {
    expect(isMilestone(now, was, 0)).toBe(true)
  })

  it('wakes for a question only when Manager has no card for it', () => {
    expect(isMilestone(worker({ state: 'asks' }), before('working'), 0)).toBe(true)
    expect(isMilestone(worker({ state: 'asks' }), before('working'), 1)).toBe(false)
  })

  it('stays quiet while nothing changed', () => {
    expect(isMilestone(worker(), before('working'), 0)).toBe(false)
  })
})

describe('update line', () => {
  it('labels commands in at most 120 characters and leaves their text out', () => {
    const long = `python3 find.py ${'x'.repeat(300)}\nsecond line`
    const line = JSON.parse(updateLine(worker({ tasks: [task('t1', 'running', long)] }), 5)) as { tasks: { id: string; status: string; label: string }[] }
    expect(line.tasks).toEqual([{ id: 't1', status: 'running', label: expect.any(String) as string }])
    expect(line.tasks[0]?.label.length).toBeLessThanOrEqual(120)
    expect(JSON.stringify(line)).not.toContain('second line')
  })

  it('prefers the task description to its command', () => {
    expect(taskLabel({ what: 'Contact search', command: 'python3 find.py' })).toBe('Contact search')
  })
})

describe('grouping', () => {
  const update = (id: string, request?: string) => ({ source: 'event', workers: [id], text: JSON.stringify({ id, state: 'idle' }), ...(request === undefined ? {} : { request }) })

  it('takes the run of worker updates up to the next message', () => {
    const queue = [update('a'), update('b'), { source: 'channel', text: 'Hi' }, update('c')]
    expect(groupUpdates(queue)).toEqual(queue.slice(0, 2))
  })

  it('keeps a person message alone', () => {
    const queue = [{ source: 'channel', text: 'Hi' }, update('a')]
    expect(groupUpdates(queue)).toEqual([queue[0]])
  })

  it('does not mix updates for different requests', () => {
    const queue = [update('a', 'r1'), update('b', 'r2')]
    expect(groupUpdates(queue)).toHaveLength(1)
  })

  it('does not group internal reconciliation events', () => {
    const queue = [{ source: 'event', text: 'Reconcile' }, update('a')]
    expect(groupUpdates(queue)).toEqual([queue[0]])
  })

  it('keeps one line per worker, at its first place, with its latest state', () => {
    const merged = mergeUpdates([JSON.stringify({ id: 'a', state: 'working' }), JSON.stringify({ id: 'b', state: 'idle' }), JSON.stringify({ id: 'a', state: 'idle' })])
    expect(merged.split('\n').map((line) => JSON.parse(line) as unknown)).toEqual([{ id: 'a', state: 'idle' }, { id: 'b', state: 'idle' }])
  })
})

describe('compaction', () => {
  it('compacts once per turn at the threshold', () => {
    expect(shouldCompact(240_000, 240_000, 3, undefined)).toBe(true)
    expect(shouldCompact(239_999, 240_000, 3, undefined)).toBe(false)
    expect(shouldCompact(300_000, 240_000, 3, 3)).toBe(false)
    expect(shouldCompact(300_000, 240_000, 4, 3)).toBe(true)
  })

  it('does nothing when off or when the size is unknown', () => {
    expect(shouldCompact(900_000, 0, 3, undefined)).toBe(false)
    expect(shouldCompact(undefined, 240_000, 3, undefined)).toBe(false)
  })

  it('accepts 0 or 50,000 to 2,000,000', () => {
    expect([0, 50_000, 240_000, 2_000_000].every(validCompactAt)).toBe(true)
    expect([-1, 49_999, 2_000_001, 1.5, '240000'].some(validCompactAt)).toBe(false)
  })
})
