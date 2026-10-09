import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => process.env['GECKIT_PLUGIN_LOG_TEST_HOME'] } }))

import type { PluginLogFields } from '../src/main/sessions/plugin-api'
import { flushPluginLogs, pluginLogger } from '../src/main/sessions/plugin-logs'
import type { PluginLogEntry } from '../src/main/sessions/plugin-logs'

let home = ''
const readEntries = async (path: string): Promise<PluginLogEntry[]> =>
  (await readFile(path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as PluginLogEntry)

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'geckit-plugin-logs-'))
  process.env['GECKIT_PLUGIN_LOG_TEST_HOME'] = home
})
afterEach(async () => {
  delete process.env['GECKIT_PLUGIN_LOG_TEST_HOME']
  await rm(home, { recursive: true, force: true })
})

it('scopes separate files and shares ordered writes between normalized legacy and current IDs', async () => {
  const first = pluginLogger({ id: 'claude-tmux' }, { loadId: 'older' })
  const second = pluginLogger({ id: 'plugin:claude-tmux' }, { loadId: 'newer' })
  const other = pluginLogger({ id: 'plugin:codex-mirror' })
  expect(first.path).toBe(join(home, 'provider-logs', 'plugin-claude-tmux.jsonl'))
  expect(second.path).toBe(first.path)
  expect(other.path).not.toBe(first.path)
  for (let sequence = 0; sequence < 100; sequence += 1) {
    const log = sequence % 2 === 0 ? first : second
    log.write('info', 'usage.check.started', { sequence, loadId: 'spoofed' })
  }
  other.write('info', 'plugin.ready')
  await Promise.all([flushPluginLogs(first.path), flushPluginLogs(other.path)])
  const entries = await readEntries(first.path)
  expect(entries.map((entry) => entry.fields?.['sequence'])).toEqual(Array.from({ length: 100 }, (_, at) => at))
  expect(entries.map((entry) => entry.fields?.['loadId'])).toEqual(Array.from({ length: 100 }, (_, at) => at % 2 === 0 ? 'older' : 'newer'))
  expect(entries.every((entry, at) => entry.plugin === 'plugin:claude-tmux' && Number.isFinite(Date.parse(entry.at)) && (at === 0 || entry.at >= (entries[at - 1]?.at ?? '')))).toBe(true)
  expect(await readdir(dirname(first.path))).toEqual(['plugin-claude-tmux.jsonl', 'plugin-codex-mirror.jsonl'])
})

it('rotates before reaching 2 MiB and keeps exactly one previous file', async () => {
  const log = pluginLogger({ id: 'plugin:large' })
  await mkdir(dirname(log.path))
  const seed = `${JSON.stringify({ event: 'prior', padding: 'x'.repeat(2 * 1024 * 1024 - 100) })}\n`
  await writeFile(log.path, seed)
  await writeFile(`${log.path}.1`, 'expired\n')
  log.write('info', 'usage.check.completed', { padding: 'y'.repeat(512) })
  await flushPluginLogs(log.path)
  expect(await readFile(`${log.path}.1`, 'utf8')).toBe(seed)
  expect((await readEntries(log.path)).map((entry) => entry.event)).toEqual(['usage.check.completed'])
  expect((await stat(log.path)).size).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect((await stat(`${log.path}.1`)).size).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(await readdir(dirname(log.path))).toEqual(['plugin-large.jsonl', 'plugin-large.jsonl.1'])
})

it('drops content and credential fields, redacts diagnostics and bounds records', async () => {
  const log = pluginLogger({ id: 'plugin:private' })
  log.write('warn', 'usage.check.failed', {
    prompt: 'private prompt', message: 'private message', output: 'private output', apiKey: 'private credential',
    transcript: 'private transcript', arguments: 'private command', credential: 'private auth',
    rawMessage: 'private raw message', toolInput: 'private tool input', imageData: 'private image', attachment: 'private attachment',
    detail: 'at /Users/alex/private/file.txt for alex@example.com https://github.com/private/repo?token=secret Bearer bearer-secret sk-abcdefghijk token=another-secret',
    count: 3, cached: true, absent: null, invalid: Number.NaN, large: 'z'.repeat(10_000),
  })
  log.write('info', 'private prompt with spaces')
  await flushPluginLogs(log.path)
  const raw = await readFile(log.path, 'utf8')
  const entries = await readEntries(log.path)
  expect(raw).not.toMatch(/private prompt|private message|private output|private credential|private transcript|private command|private auth|private raw message|private tool input|private image|private attachment|bearer-secret|sk-abcdefghijk|another-secret|\/Users\/alex|alex@example\.com|github\.com\/private/)
  expect(entries[0]?.fields).toMatchObject({ count: 3, cached: true, absent: null })
  expect(entries[0]?.fields?.['invalid']).toBeUndefined()
  expect(String(entries[0]?.fields?.['large']).length).toBe(512)
  expect(entries[1]?.event).toBe('plugin.event')
})

it('swallows storage and malformed-field failures and recovers on the next write', async () => {
  const log = pluginLogger({ id: 'plugin:recover' })
  await writeFile(dirname(log.path), 'block directory creation')
  expect(() => log.write('error', 'failed')).not.toThrow()
  await expect(flushPluginLogs(log.path)).resolves.toBeUndefined()
  await rm(dirname(log.path))
  const malformed: PluginLogFields = Object.defineProperty({}, 'reason', { enumerable: true, get: () => { throw new Error('bad diagnostic') } })
  expect(() => log.write('info', 'malformed', malformed)).not.toThrow()
  log.write('info', 'recovered')
  await flushPluginLogs(log.path)
  expect((await readEntries(log.path)).map((entry) => entry.event)).toEqual(['recovered'])
  delete process.env['GECKIT_PLUGIN_LOG_TEST_HOME']
  const unavailable = pluginLogger({ id: 'plugin:recover' })
  expect(unavailable.path).toBe('')
  expect(() => unavailable.write('info', 'disabled')).not.toThrow()
})
