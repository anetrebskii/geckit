import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readControl } from '../src/main/hosts/run'
import { runsAt } from '../src/main/hosts/runs'

/**
 * A run picked up again at the next start: how far its output was read, and
 * a control_request not yet answered when GeckIt last quit, which a reattach
 * must not read past or the card it waits on is never asked again.
 */

describe('the runs on hosts, kept across a restart', () => {
  it('moves the read offset on as lines come, without a control_request outstanding', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const runs = runsAt(join(folder, 'runs.json'))
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.read('s-1', 120)
      expect(runs.get('s-1')?.offset).toBe(120)
      runs.read('s-1', 340)
      expect(runs.get('s-1')?.offset).toBe(340)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('never carries the offset past a control_request not yet answered', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const runs = runsAt(join(folder, 'runs.json'))
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.read('s-1', 100)
      // A control_request begins at byte 100: nothing past it is kept until it is answered.
      runs.pending('s-1', 100)
      runs.read('s-1', 260)
      expect(runs.get('s-1')?.offset).toBe(100)
      runs.read('s-1', 400)
      expect(runs.get('s-1')?.offset).toBe(100)
      // Answered: the offset moves on to wherever the reader has actually reached.
      runs.pending('s-1', undefined)
      runs.read('s-1', 400)
      expect(runs.get('s-1')?.offset).toBe(400)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('keeps the earliest outstanding request, not a later one, as the cap', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const runs = runsAt(join(folder, 'runs.json'))
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.pending('s-1', 50)
      runs.read('s-1', 500)
      expect(runs.get('s-1')?.offset).toBe(50)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it("moves the offset on to where the run has actually reached the moment its pending question clears, rather than leaving it capped until the next line happens to arrive", async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const runs = runsAt(join(folder, 'runs.json'))
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.read('s-1', 100)
      runs.pending('s-1', 100)
      // Answered: cleared with the run's own offset right then, a long quiet tool call having moved it on without a line of output.
      runs.pending('s-1', undefined, 340)
      expect(runs.get('s-1')).toEqual({ host: 'devbox', root: 'ssh://devbox/home/leo', started: 1, offset: 340 })
      // A quit right there and a restart reads on from 340, not replaying the request already answered.
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('reads a record back from disk once a debounced write has landed', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const path = join(folder, 'runs.json')
      const runs = runsAt(path)
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.read('s-1', 42)
      await runs.flush()
      const again = runsAt(path)
      expect(again.get('s-1')?.offset).toBe(42)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('forgets a run, writing that at once rather than on the debounce', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-runs-'))
    try {
      const path = join(folder, 'runs.json')
      const runs = runsAt(path)
      runs.set('s-1', { host: 'devbox', root: 'ssh://devbox/home/leo', offset: 0, started: 1 })
      runs.delete('s-1')
      const again = runsAt(path)
      expect(again.get('s-1')).toBeUndefined()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})

describe('the questions a run on a host is waiting on', () => {
  it('reads a question, its answer and a question taken back by the id they share', () => {
    expect(readControl('{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool"}}')).toEqual({ type: 'control_request', id: 'r1' })
    expect(readControl('{"type":"control_response","response":{"subtype":"success","request_id":"r1"}}')).toEqual({ type: 'control_response', id: 'r1' })
    expect(readControl('{"type":"control_cancel_request","request_id":"r1"}')).toEqual({ type: 'control_cancel_request', id: 'r1' })
    expect(readControl('{"type":"assistant"}')).toBeUndefined()
    expect(readControl('{"type":"control_request"')).toBeUndefined()
  })
})
