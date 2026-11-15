import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatSession, Shortcut } from '../src/shared/api'
import type { Manager } from '../src/main/manager'
import type { ShortcutRun } from '../src/shared/shortcut-runs'
import type { ChannelShortcutPublication } from '../src/main/channels/channel-api'
import { ChannelShortcutError } from '../src/main/channels/channel-api'
import { ShortcutRuns } from '../src/main/shortcut-runs'

vi.mock('../src/core/clean', () => ({ cleanText: async (text: string) => text.replaceAll('test-secret', '[secret:fixture]') }))
const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-shortcut-runs-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const source: ChatSession = { id: 'source', root: '/project', title: 'Source', stands: 'Done', state: 'idle', at: 1, here: true, mode: 'auto' }
  let conversations: readonly ChatSession[] = [source]
  let settled = false
  let ready = true
  let owned = true
  let stopped = false
  const responses = new Set<Parameters<Manager['onResponse']>[0]>()
  const changes = new Set<Parameters<Manager['on']>[0]>()
  const manager: ConstructorParameters<typeof ShortcutRuns>[0]['manager'] = {
    thread: (open) => open.key,
    open: async () => { if (!ready) throw new Error('Manager unavailable'); return 'manager-source' },
    working: () => ready,
    runShortcut: async () => source.id,
    attachShortcutWorker: vi.fn(async () => undefined),
    bindShortcutThread: vi.fn((id) => id),
    shortcutSettled: () => settled,
    shortcutOwns: () => owned,
    send: vi.fn(async () => 'manager-source'),
    on: (callback) => { changes.add(callback); return () => changes.delete(callback) },
    onResponse: (callback) => { responses.add(callback); return () => responses.delete(callback) },
  }
  const published: Omit<ChannelShortcutPublication, 'destination'>[] = []
  let fail: ChannelShortcutError | undefined
  const publish = vi.fn<ConstructorParameters<typeof ShortcutRuns>[0]['publish']>(async (destination, input) => {
    expect((JSON.parse(readFileSync(join(directory, 'shortcut-runs.json'), 'utf8')) as readonly ShortcutRun[]).find((one) => one.id === input.runId)?.delivery).toBe('sending')
    published.push(input)
    if (fail !== undefined) throw fail
    const thread = `native-${published.length}`
    input.bind({ key: thread, shared: true })
    return { destination: destination.destination, thread }
  })
  const emitted: ShortcutRun[] = []
  const deps: ConstructorParameters<typeof ShortcutRuns>[0] = { directory, onRun: (run) => {
    const persisted = JSON.parse(readFileSync(join(directory, 'shortcut-runs.json'), 'utf8')) as readonly ShortcutRun[]
    expect(persisted.find((one) => one.id === run.id)).toEqual(run)
    emitted.push(run)
  }, manager, conversations: () => conversations, items: async () => [{ kind: 'theirs', id: 'full', text: 'Full original result test-secret', phase: 'final_answer' }, ...(stopped ? [{ kind: 'note' as const, id: 'stopped', note: 'stopped' as const, text: 'Stopped' }] : [])], publish }
  let runs = new ShortcutRuns(deps)
  cleanups.push(() => runs.dispose())
  const shortcut: Shortcut & Required<Pick<Shortcut, 'destination'>> = { id: 'job', name: 'Review', root: '/project', prompt: 'Original prompt', mode: 'auto', on: false, since: 1, destination: { channel: 'channel:discord', destination: 'general-id', label: '#general' } }
  return { directory, shortcut, emitted, published, publish, manager, runs, unown: () => { owned = false; runs.changed() }, stop: () => { stopped = true }, unavailable: () => { conversations = []; runs.changed() }, ready: (value: boolean) => { ready = value }, settle: () => { settled = true; runs.changed() }, fail: (error: ChannelShortcutError) => { fail = error }, source: (change: Partial<ChatSession>) => { conversations = [{ ...source, ...change }]; runs.changed() }, response: (text: string, thread = runs.all().at(-1)?.managerThread ?? '') => { for (const callback of responses) callback(text, { thread, session: 'manager-source', workers: [source.id] }); runs.changed() }, reload: () => { runs.dispose(); runs = new ShortcutRuns(deps); runs.changed(); return runs } }
}

it('snapshots each run before dispatch, cleans the full result, binds independent native threads and suppresses duplicate events', async () => {
  const f = fixture()
  await f.runs.start(f.shortcut, async () => {
    expect(f.runs.all()[0]?.shortcut.prompt).toBe('Original prompt')
    expect(f.runs.all()[0]?.session).toBeUndefined()
    return 'source'
  })
  f.response('Acknowledged')
  await new Promise((resolve) => setImmediate(resolve))
  expect(f.publish).not.toHaveBeenCalled()
  f.settle()
  await vi.waitFor(() => expect(f.runs.all()[0]?.delivery).toBe('sent'))
  expect(f.emitted.map((run) => run.delivery)).toEqual(expect.arrayContaining(['waiting', 'sending', 'sent']))
  expect(f.emitted.at(-1)?.receipt?.thread).toBe('native-1')
  expect(f.published[0]?.text).toBe('Full original result [secret:fixture]')
  await f.runs.start({ ...f.shortcut, destination: { ...f.shortcut.destination, destination: 'another-id' } }, async () => 'source')
  f.response('Next result')
  await vi.waitFor(() => expect(f.runs.all()[1]?.delivery).toBe('sent'))
  expect(f.runs.all().map((one) => one.shortcut.destination.destination)).toEqual(['general-id', 'another-id'])
  expect(f.runs.all().map((one) => one.receipt?.thread)).toEqual(['native-1', 'native-2'])
  expect(new Set(f.runs.all().map((one) => one.managerThread)).size).toBe(2)
  f.runs.changed()
  const reloaded = f.reload()
  await new Promise((resolve) => setImmediate(resolve))
  expect(reloaded.all()).toHaveLength(2)
  expect(f.publish).toHaveBeenCalledTimes(2)
})

it.each([false, true])('retains a completed result and reports definite versus uncertain transport failure: %s', async (uncertain) => {
  const f = fixture()
  f.fail(new ChannelShortcutError(uncertain, 'Destination unavailable'))
  await f.runs.start(f.shortcut, async () => 'source')
  f.response('Completed result')
  f.settle()
  await vi.waitFor(() => expect(f.runs.all()[0]?.delivery).toBe(uncertain ? 'uncertain' : 'failed'))
  expect(f.runs.all()[0]).toMatchObject({ state: 'completed', error: 'Destination unavailable', session: 'source' })
  f.reload()
  await new Promise((resolve) => setImmediate(resolve))
  expect(f.publish).toHaveBeenCalledTimes(1)
})

it('does not start an ordinary worker while Manager is unavailable', async () => {
  const f = fixture()
  f.ready(false)
  const start = vi.fn(async () => 'source')
  await expect(f.runs.start(f.shortcut, start)).rejects.toThrow('Manager unavailable')
  expect(start).not.toHaveBeenCalled()
  expect(f.runs.all()[0]).toMatchObject({ state: 'failed', delivery: 'failed' })
})

it('marks interrupted sends uncertain and never reposts them on restart', async () => {
  const f = fixture()
  await f.runs.start(f.shortcut, async () => 'source')
  const run = f.runs.all()[0]
  writeFileSync(join(f.directory, 'shortcut-runs.json'), JSON.stringify([{ ...run, state: 'completed', delivery: 'sending', result: 'Saved result' }]))
  expect(f.reload().all()[0]).toMatchObject({ delivery: 'uncertain', result: 'Saved result' })
  f.settle()
  await new Promise((resolve) => setImmediate(resolve))
  expect(f.publish).not.toHaveBeenCalled()
})

it('resumes waiting runs after restart and records terminal execution failures without sending', async () => {
  const f = fixture()
  await f.runs.start(f.shortcut, async () => 'source')
  f.response('Durable result')
  const runs = f.reload()
  f.settle()
  await vi.waitFor(() => expect(runs.all()[0]?.delivery).toBe('sent'))
  await runs.start(f.shortcut, async () => 'source')
  f.source({ state: 'failed', stands: 'Provider failed' })
  await vi.waitFor(() => expect(runs.all()[1]).toMatchObject({ state: 'failed', delivery: 'failed', error: 'Provider failed' }))
  expect(f.publish).toHaveBeenCalledTimes(1)
})

it('refuses publication after original worker ownership changes and reports source unavailability', async () => {
  const f = fixture()
  await f.runs.start(f.shortcut, async () => 'source')
  f.response('Final result')
  f.unavailable()
  await vi.waitFor(() => expect(f.runs.all()[0]?.error).toContain('source context is unavailable'))
  f.source({})
  f.unown()
  f.settle()
  await vi.waitFor(() => expect(f.runs.all()[0]).toMatchObject({ state: 'failed', delivery: 'failed', error: expect.stringContaining('no longer tracked') }))
  expect(f.publish).not.toHaveBeenCalled()
})

it('keeps stopped source work distinct from completion', async () => {
  const f = fixture()
  await f.runs.start(f.shortcut, async () => 'source')
  f.response('Manager summary')
  f.stop()
  f.settle()
  await vi.waitFor(() => expect(f.runs.all()[0]).toMatchObject({ state: 'failed', delivery: 'failed', error: expect.stringContaining('stopped before completion') }))
  expect(f.publish).not.toHaveBeenCalled()
})
