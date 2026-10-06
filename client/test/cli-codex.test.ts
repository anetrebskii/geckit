import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import type { StartAsked } from '../src/main/asked'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Conversation, Found } from '../src/main/sessions/disk'
import type * as Disk from '../src/main/sessions/disk'
import type { SessionNote } from '../src/main/sessions'

const codex = vi.hoisted(() => ({ list: vi.fn<(roots: readonly string[]) => Promise<(Found & { root: string; created?: number })[]>>(), read: vi.fn<(root: string, id: string) => Promise<Conversation | undefined>>(), dispose: vi.fn<() => void>() }))

vi.mock('../src/main/sessions/codex', () => ({ CodexSessions: class { list = codex.list; read = codex.read; dispose = codex.dispose } }))
vi.mock('../src/main/sessions/disk', async (original) => ({ ...await original<typeof Disk>(), listClaude: async () => [] }))

import { run, start } from '../src/cli'

const ROOT = '/work/app'
const ID = 'codex:019f0000-0000-7000-8000-000000000001'
let folder = ''

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'geckit-cli-codex-'))
  vi.stubEnv('GECKIT_DATA', folder)
  codex.list.mockResolvedValue([{ id: ID, root: ROOT, title: 'Native title', stands: 'Finished', at: 2000, created: 1000, driven: true }])
  codex.read.mockResolvedValue({ items: [{ kind: 'mine', id: 'user', text: 'Do it' }, { kind: 'did', id: 'tool', what: 'Ran a command' }, { kind: 'theirs', id: 'answer', text: 'Done' }], tasks: [] })
  writeFileSync(join(folder, 'settings.json'), JSON.stringify({ projects: [ROOT], favorites: [ID] }))
  const notes: Readonly<Record<string, SessionNote>> = { [ID]: { title: 'GeckIt title', status: 'done', created: 500, moves: [{ status: 'review', at: 1500 }, { status: 'done', at: 2000 }] } }
  writeFileSync(join(folder, 'sessions.json'), JSON.stringify(notes))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  rmSync(folder, { recursive: true, force: true })
})

describe('Codex conversations in the GeckIt CLI', () => {
  it('sends a Codex-qualified parent and requested title over the CLI socket', async () => {
    vi.stubEnv('CODEX_THREAD_ID', ID.slice(6))
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'inherited-claude')
    const received: StartAsked[] = []
    const server = createServer((socket) => {
      socket.setEncoding('utf8')
      socket.on('data', (text: string) => {
        received.push(JSON.parse(text) as StartAsked)
        socket.end(JSON.stringify({ ok: true, tasks: [{ answer: 'queued', id: 'codex:child' }] }))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(join(folder, 'geckit.sock'), resolve)
    })
    try {
      expect(await start(['--project', 'app', '--title', 'Requested title', 'Fix it'])).toEqual({ ok: true, said: '1 Queued codex:child' })
      expect(received).toEqual([{ from: ID, tasks: [{ project: 'app', title: 'Requested title', text: 'Fix it' }] }])
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
    }
  })

  it('lists migrated metadata, favorites and exact history', async () => {
    const result = await run(['sessions', '--provider', 'codex', '--status', 'done', '--favorites', '--json'])
    expect(JSON.parse(result)).toEqual([{ id: ID, provider: 'codex', at: new Date(2000).toISOString(), project: 'app', root: ROOT, status: 'done', title: 'GeckIt title', favorite: true, last: 'Finished', history: [{ status: 'created', at: new Date(500).toISOString() }, { status: 'review', at: new Date(1500).toISOString() }, { status: 'done', at: new Date(2000).toISOString() }] }])
    expect(codex.dispose).toHaveBeenCalledOnce()
  })

  it('shows a Codex transcript by its native ID without asking for a Claude file', async () => {
    const result = await run(['show', ID.slice(6), '--last', '1', '--json'])
    expect(JSON.parse(result)).toMatchObject({ id: ID, provider: 'codex', status: 'done', title: 'GeckIt title', said: [{ who: 'Codex', text: 'Done' }] })
    expect(codex.read).toHaveBeenCalledWith(ROOT, ID)
    expect(codex.dispose).toHaveBeenCalledOnce()
  })

  it('prints a usable Codex ID even when imported threads share their leading timestamp', async () => {
    expect(await run(['sessions'])).toContain(ID)
  })

  it('counts the original Done date when the transcript was last changed before today', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    writeFileSync(join(folder, 'sessions.json'), JSON.stringify({ [ID]: { status: 'done', moves: [{ status: 'done', at: today.getTime() + 1 }] } }))
    expect(JSON.parse(await run(['sessions', '--today', '--provider', 'codex', '--json']))).toHaveLength(1)
  })

  it('keeps hidden Codex conversations out of the list', async () => {
    writeFileSync(join(folder, 'sessions.json'), JSON.stringify({ [ID]: { hidden: true } }))
    expect(JSON.parse(await run(['sessions', '--json']))).toEqual([])
  })

  it('reads a migrated parent link using the current Codex thread ID', async () => {
    const parent = 'codex:019f0000-0000-7000-8000-000000000002'
    const child = (await codex.list([]))[0]
    codex.list.mockResolvedValue([...(child === undefined ? [] : [child]), { id: parent, root: ROOT, title: 'Parent', stands: '', at: 1000, driven: true }])
    writeFileSync(join(folder, 'sessions.json'), JSON.stringify({ [ID]: { parent }, [parent]: { status: 'done' } }))
    vi.stubEnv('CODEX_THREAD_ID', ID.slice(6))
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', undefined)
    expect(JSON.parse(await run(['linked', '--json']))).toMatchObject({ parent: { id: parent, status: 'done', title: 'Parent' } })
  })
})

it('provides standalone AI build instructions without contacting an AI provider', async () => {
  expect(await run(['instructions', 'providers'])).toContain('examples/codex-provider')
  expect(await run(['instructions', 'providers'])).toContain('per million tokens')
  expect(await run(['instructions', 'app'])).toContain('npm run typecheck')
  expect(codex.list).not.toHaveBeenCalled()
  expect(codex.read).not.toHaveBeenCalled()
})
