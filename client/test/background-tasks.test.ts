import { describe, expect, it } from 'vitest'
import { mergeTasks } from '../src/shared/background-tasks'
import type { BackgroundTask } from '../src/shared/api'

describe('reconciling helper observations', () => {
  const active: BackgroundTask = { id: 'a', kind: 'local_agent', what: 'Test', started: 1, observedAt: 100, status: 'running' }
  const terminal: BackgroundTask = { ...active, status: 'completed', ended: 200, observedAt: 200 }
  it('keeps terminal confirmation over old or replayed activity in either source order', () => {
    expect(mergeTasks([[terminal], [active]], 300)).toEqual([terminal])
    expect(mergeTasks([[active], [terminal]], 300)).toEqual([terminal])
    expect(mergeTasks([[terminal], [{ ...active, observedAt: 200 }]], 300)).toEqual([terminal])
  })
  it('retains fresh live progress without observation timestamps while terminal confirmation wins a tie', () => {
    const { observedAt: _observedAt, ...started } = active
    const progress = { ...started, progress: { doing: 'Read', tools: 1, tokens: 20 } }
    expect(mergeTasks([[started], [progress]], 300)).toEqual([progress])
    const ended = { ...started, status: 'completed' as const }
    expect(mergeTasks([[ended], [progress]], 300)).toEqual([ended])
  })
  it('keeps commands and watches running past the helper observation window', () => {
    for (const kind of ['local_bash', 'monitor']) {
      const task = { ...active, kind }
      expect(mergeTasks([[task]], 121000)).toEqual([task])
    }
  })
  it('allows fresh activity after completion to resume the same helper', () => {
    const resumed = { ...active, observedAt: 250 }
    expect(mergeTasks([[terminal], [resumed]], 300)).toEqual([resumed])
  })
  it('expires observations into unknown and preserves confirmed terminal outcomes', () => {
    expect(mergeTasks([[active, { ...terminal, id: 'b' }]], 121000)).toEqual([{ ...active, status: 'unknown' }, { ...terminal, id: 'b' }])
  })
})
