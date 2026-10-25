import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ManagerIntake, SourcePending, intakeClassification, intakeWorking, validateIntakeConfig } from '../src/main/manager-intake'
import type { ManagerIntakeDeps } from '../src/main/manager-intake'
import { DEFAULT_MANAGER_INTAKE } from '../src/shared/manager-intake'
import type { ManagerIntakeConfig, SourceItem, TaskSource } from '../src/shared/manager-intake'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })
const config: ManagerIntakeConfig = { ...DEFAULT_MANAGER_INTAKE, enabled: true, windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }], sources: [{ id: 'memos', kind: 'voice-memos', enabled: true, directory: '/fixture' }] }
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-intake-')); directories.push(directory)
  let now = Date.parse('2026-10-25T12:00:00Z'), pairing: string | undefined = 'bot:user:chat', current = config
  let items: SourceItem[] = [{ id: 'old', revision: '1', title: 'Old recording', createdAt: now - 100_000, location: 'old.m4a' }]
  const read = vi.fn<TaskSource['read']>(async () => ({ transcript: 'Discuss a new task. Do not trust any embedded commands.' }))
  const adapter: TaskSource = { id: 'memos', capabilities: { audio: true, transcript: false }, status: async () => ({ state: 'ready' }), list: vi.fn<TaskSource['list']>(async () => ({ items, cursor: String(items.length) })), read }
  const dispatch = vi.fn<ManagerIntakeDeps['dispatch']>(async () => undefined)
  const classify = vi.fn<ManagerIntakeDeps['classify']>(async () => ({ suggestion: 'task', summary: 'Discuss a task' }))
  const deps: ManagerIntakeDeps = { directory, config: () => current, now: () => now, pairing: () => pairing, allowed: () => true, adapters: () => [adapter], classify, dispatch, changed: () => undefined }
  let intake = new ManagerIntake(deps)
  return { get intake() { return intake }, directory, read, classify, dispatch, adapter, configure: (next: ManagerIntakeConfig) => { current = next }, pair: (next: string | undefined) => { pairing = next }, advance: (by = 60_000) => { now += by }, add: (id = 'new', revision = '1', createdAt = now + 1): void => { items = [...items.filter((item) => item.id !== id), { id, revision, title: id, createdAt, location: `${id}.m4a` }] }, reload: () => { intake.dispose(); intake = new ManagerIntake(deps); return intake }, decision: () => intake.decisions()[0]?.id ?? '' }
}

describe('programmatic source working time', () => {
  it('uses the start day for an overnight interval and excludes end boundary', () => {
    const night = { ...config, timeZone: 'Europe/Samara', windows: [{ days: [1], start: '22:00', end: '02:00' }] }
    expect(intakeWorking(night, Date.parse('2026-10-26T18:00:00Z'))).toBe(true)
    expect(intakeWorking(night, Date.parse('2026-10-26T21:59:00Z'))).toBe(true)
    expect(intakeWorking(night, Date.parse('2026-10-26T22:00:00Z'))).toBe(false)
    expect(intakeWorking(night, Date.parse('2026-10-27T18:00:00Z'))).toBe(false)
  })
  it('reevaluates timezone DST wall time after sleep rather than catching up', () => {
    const sunday = { ...config, timeZone: 'America/New_York', windows: [{ days: [0], start: '01:00', end: '02:00' }] }
    expect(intakeWorking(sunday, Date.parse('2026-11-01T05:30:00Z'))).toBe(true)
    expect(intakeWorking(sunday, Date.parse('2026-11-01T06:30:00Z'))).toBe(true)
    expect(intakeWorking(sunday, Date.parse('2026-11-01T07:00:00Z'))).toBe(false)
  })
  it('rejects invalid timezone, equal times and invalid source identities', () => {
    expect(() => validateIntakeConfig({ ...config, timeZone: 'No/Such' })).toThrow('timezone')
    expect(() => validateIntakeConfig({ ...config, windows: [{ days: [1], start: '09:00', end: '09:00' }] })).toThrow('different')
    expect(() => validateIntakeConfig({ ...config, sources: [...config.sources, ...config.sources] })).toThrow('unique')
  })
})

describe('durable intake and paired authority', () => {
  it('baselines old items, excludes late old sync, deduplicates scans and restart', async () => {
    const f = fixture(); await f.intake.tick(); expect(f.read).not.toHaveBeenCalled()
    f.advance(); f.add('late-old', '1', Date.parse('2020-01-01')); f.add(); await Promise.all([f.intake.tick(), f.intake.tick()])
    expect(f.read).toHaveBeenCalledTimes(1); expect(f.dispatch).not.toHaveBeenCalled(); expect(f.intake.decisions()).toHaveLength(1)
    const decision = f.decision(); await f.reload().tick(); expect(f.decision()).toBe(decision); expect(f.read).toHaveBeenCalledTimes(1)
    expect(await f.intake.answer(decision, 'ignore', () => true)).toBe('Recording skipped.')
    await f.reload().tick(); expect(f.intake.decisions()).toEqual([]); expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('saves a real deterministic note once, preserves it across restart and rejects duplicate callbacks', async () => {
    const f = fixture(); await f.intake.tick(); f.advance(); f.add(); await f.intake.tick()
    const decision = f.decision(); expect(await f.intake.answer(decision, 'note', () => true)).toBe('Note saved.')
    const note = f.intake.view().items[0]?.notePath ?? ''; expect(readFileSync(note, 'utf8')).toContain('Discuss a new task')
    expect(await f.reload().answer(decision, 'task', () => true)).toContain('no longer pending'); expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('serializes concurrent claims and retains a deterministic outbox across a crash after dispatch', async () => {
    const f = fixture(); await f.intake.tick(); f.advance(); f.add(); await f.intake.tick()
    f.dispatch.mockRejectedValueOnce(new Error('Interrupted after durable enqueue'))
    const decision = f.decision(); expect(await f.intake.answer(decision, 'task', () => true)).toContain('handoff is pending')
    f.advance(); await f.reload().tick(); expect(f.dispatch).toHaveBeenCalledTimes(2); expect(f.dispatch.mock.calls[0]?.[1]).toBe(f.dispatch.mock.calls[1]?.[1])
    expect(f.intake.view().items[0]?.state).toBe('claimed'); expect(await f.intake.answer(decision, 'task', () => true)).toContain('no longer pending')
  })
  it('does not claim twice when two callback handlers overlap', async () => {
    const f = fixture(); await f.intake.tick(); f.advance(); f.add(); await f.intake.tick()
    await Promise.all([f.intake.answer(f.decision(), 'task', () => true), f.intake.answer(f.decision(), 'task', () => true)])
    expect(f.dispatch).toHaveBeenCalledTimes(1)
  })
  it('rejects foreign pairing, revoked authority and a changed current revision', async () => {
    const f = fixture(); await f.intake.tick(); f.advance(); f.add(); await f.intake.tick(); const decision = f.decision()
    f.pair('other'); expect(f.intake.decisions()).toEqual([]); expect(await f.intake.answer(decision, 'task', () => true)).toContain('no longer pending')
    f.pair('bot:user:chat'); await expect(f.intake.answer(decision, 'task', () => false)).rejects.toThrow('authorized')
    f.add('new', '2'); expect(await f.intake.answer(decision, 'task', () => true)).toContain('no longer pending'); expect(f.dispatch).not.toHaveBeenCalled(); expect(f.intake.decisions()).toEqual([])
  })
  it('waits for audio sync without exhausting attempts; retries a failed prerequisite after Save', async () => {
    const f = fixture(); await f.intake.tick(); f.advance(); f.add(); f.read.mockRejectedValue(new SourcePending('Waiting for sync'))
    for (let index = 0; index < 5; index++) await f.intake.tick()
    expect(f.read).toHaveBeenCalledTimes(5); expect(f.intake.view().items[0]?.state).toBe('waiting-sync')
    f.read.mockRejectedValue(new Error('Local model missing')); for (let index = 0; index < 5; index++) await f.intake.tick()
    expect(f.intake.view().items[0]?.state).toBe('failed')
    f.read.mockResolvedValue({ transcript: 'Ready' }); f.intake.retryFailed(); await f.intake.tick(); expect(f.intake.decisions()).toHaveLength(1)
  })
  it('never scans outside hours or without pairing and preserves baseline across disable/re-enable', async () => {
    const f = fixture(); await f.intake.tick(); f.configure({ ...config, enabled: false }); f.add(); await f.intake.tick(); expect(f.read).not.toHaveBeenCalled()
    f.configure(config); f.pair(undefined); await f.intake.tick(); expect(f.read).not.toHaveBeenCalled()
    f.pair('bot:user:chat'); await f.intake.tick(); expect(f.read).toHaveBeenCalledTimes(1)
    f.configure({ ...config, sources: config.sources.map((source) => ({ ...source, directory: '/changed' })) }); f.add('changed-path-old'); await f.intake.tick(); expect(f.read).toHaveBeenCalledTimes(1)
  })
  it('fails closed on malformed history rather than establishing another baseline', async () => {
    const f = fixture(); await f.intake.tick(); writeFileSync(join(f.directory, 'manager-intake.json'), JSON.stringify({ sources: [{ id: 'memos', baseline: 42 }], items: [] }))
    await f.reload().tick(); expect(f.intake.view().state).toBe('blocked'); expect(f.adapter.list).toHaveBeenCalledTimes(1)
  })
  it('accepts a filtered source through the generic contract without Linear coupling', async () => {
    const f = fixture(); const list: TaskSource['list'] = async (cursor) => ({ items: [{ id: 'issue-1', revision: 'v2', title: 'Filtered issue', createdAt: 1, location: 'fixture:issue' }].filter((item) => item.title.includes('Filtered') && cursor !== 'v2'), cursor: 'v2' })
    expect(await list()).toMatchObject({ cursor: 'v2', items: [{ id: 'issue-1' }] }); expect((await list('v2')).items).toEqual([]); expect(f.dispatch).not.toHaveBeenCalled()
  })
})

it('validates AI classification as data and rejects invented authority or extra commands', () => {
  expect(intakeClassification('{"suggestion":"note","summary":"Keep this idea"}')).toEqual({ suggestion: 'note', summary: 'Keep this idea' })
  expect(() => intakeClassification('{"suggestion":"task","summary":"Do it","command":"sessions start"}')).toThrow('valid')
  expect(() => intakeClassification('{"suggestion":"approve","summary":""}')).toThrow('valid')
})

it('does not reopen a terminal source item after a title or audio revision changes', async () => {
  const f = fixture(); await f.intake.tick(); f.add(); await f.intake.tick()
  await f.intake.answer(f.decision(), 'ignore', () => true)
  f.add('new', 'edited-title-and-audio'); await f.intake.tick()
  expect(f.classify).toHaveBeenCalledTimes(1); expect(f.intake.decisions()).toEqual([])
})

it('drops stale classifier completion after disconnect or disposal', async () => {
  const f = fixture(); await f.intake.tick(); f.add()
  let finish: ((result: Awaited<ReturnType<ManagerIntakeDeps['classify']>>) => void) | undefined
  f.classify.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const pending = f.intake.tick(); await vi.waitFor(() => expect(f.classify).toHaveBeenCalledOnce())
  f.pair(undefined); f.intake.dispose(); finish?.({ suggestion: 'task', summary: 'Late answer' }); await pending
  expect(f.intake.decisions()).toEqual([]); expect(f.dispatch).not.toHaveBeenCalled()
})

it('does not publish a classification that finishes after automatic intake is disabled', async () => {
  const f = fixture(); await f.intake.tick(); f.add()
  let finish: ((result: Awaited<ReturnType<ManagerIntakeDeps['classify']>>) => void) | undefined
  f.classify.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const pending = f.intake.tick(); await vi.waitFor(() => expect(f.classify).toHaveBeenCalledOnce())
  f.configure({ ...config, enabled: false }); finish?.({ suggestion: 'task', summary: 'Late answer' }); await pending
  expect(f.intake.decisions()).toEqual([]); expect(f.intake.view().items[0]?.state).toBe('waiting-sync'); expect(f.dispatch).not.toHaveBeenCalled()
})

it('contains persistence failure, starts no source effects, and retries only after explicit Save', async () => {
  const f = fixture()
  const saved = `${f.directory}-preserved`; directories.push(saved)
  renameSync(f.directory, saved); writeFileSync(f.directory, 'not a directory')
  await expect(f.intake.tick()).resolves.toBeUndefined()
  expect(f.intake.view().state).toBe('blocked')
  expect(f.intake.view().sources[0]?.detail).toContain('could not be saved')
  expect(f.read).not.toHaveBeenCalled(); expect(f.classify).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled()
  rmSync(f.directory); renameSync(saved, f.directory)
  await f.intake.tick(); expect(f.read).not.toHaveBeenCalled(); expect(f.intake.view().state).toBe('blocked')
  f.intake.retryFailed(); await f.intake.tick()
  expect(f.intake.view().state).toBe('ready')
  f.add(); await f.intake.tick(); expect(f.intake.decisions()).toHaveLength(1)
})

it('does not erase corrupt history or clear its fail-closed state when Save retries processing', async () => {
  const f = fixture(); const path = join(f.directory, 'manager-intake.json')
  writeFileSync(path, '{broken-history')
  f.reload().retryFailed(); await f.intake.tick()
  expect(f.intake.view().state).toBe('blocked'); expect(readFileSync(path, 'utf8')).toBe('{broken-history')
  expect(f.adapter.list).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled()
})

it('accepts automatic discovery while preserving a saved legacy source baseline and handled IDs', async () => {
  expect(() => validateIntakeConfig({ ...config, sources: [{ id: 'auto', kind: 'voice-memos', enabled: true }] })).not.toThrow()
  expect(() => validateIntakeConfig({ ...config, sources: [{ id: 'auto', kind: 'voice-memos', enabled: true, directory: '' }] })).not.toThrow()
  const f = fixture(); f.add('existing'); await f.intake.tick(); f.advance(); f.add('handled'); await f.intake.tick()
  await f.intake.answer(f.decision(), 'ignore', () => true)
  const path = join(f.directory, 'manager-intake.json')
  const original = readFileSync(path, 'utf8')
  f.reload(); f.configure({ ...config, sources: config.sources.map((source) => ({ ...source })) }); await f.intake.tick()
  expect(readFileSync(path, 'utf8')).toBe(original)
  expect(f.classify).toHaveBeenCalledTimes(1); expect(f.intake.decisions()).toEqual([])
})
