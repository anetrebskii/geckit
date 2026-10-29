import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { continueConversation, prepareConversation, writeConversationExport } from '../src/main/conversation-export'
import type { ConversationTransferDeps } from '../src/main/conversation-export'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { ConversationContinuation, ConversationSnapshot, SessionItem } from '../src/shared/api'
import { conversationMarkdown, conversationOverview, HISTORY_AVAILABILITY } from '../src/shared/conversation-export'

const history: readonly SessionItem[] = [
  { kind: 'mine', id: 'user', text: 'Задача: сохранить всё.\n```ts\nconst x = 1\n```\n````', at: 1, images: [{ media: 'image/png', data: 'AAAA', ref: '/source/picture.png' }, { media: 'image/jpeg', data: '', ref: 'image:missing' }] },
  { kind: 'theirs', id: 'assistant', text: 'Decision remains in the full transcript.', phase: 'final_answer', at: 2 },
  { kind: 'thought', id: 'thought', text: 'Recorded thought' },
  { kind: 'did', id: 'tool', what: 'Ran test', detail: `argument: --all\n${'long output\n'.repeat(20_000)}`, path: '/source/file.ts', live: true, images: [{ media: 'image/png', data: 'BBBB' }] },
  { kind: 'shell', id: 'shell', command: 'npm run test', output: 'old output', code: 1, stopped: true, running: false, at: 3 },
  { kind: 'card', id: 'card', card: { kind: 'permission', title: 'Run command?', detail: 'npm run test', answered: 'Allowed once' } },
  { kind: 'wrote', id: 'files', paths: ['/source/file.ts', '/source/other.ts'] },
  { kind: 'note', id: 'summary', note: 'summarised', text: 'Earlier context was summarised.', detail: 'Only saved content remains.' },
  { kind: 'request', id: 'request', tasks: [{ project: '/source', title: 'Old helper', text: 'Do old work', started: 'child' }], answer: { how: 'answered', where: 'mac', reply: 'Already answered' } },
  { kind: 'steps', id: 'steps', ids: ['unavailable-tool'], latest: 'Old collapsed step' },
]

const source: ConversationSnapshot = {
  at: 10_000,
  session: { id: 'source', root: '/source', title: 'Полный чат', stands: 'Working', state: 'working', at: 9_000, here: true, mode: 'manual', model: 'claude-source', goal: { condition: 'Historical goal', checks: 1 }, queued: [{ id: 'pending', text: 'Unsent queued instruction', images: 0 }] },
  items: history,
}

describe('portable conversation Markdown', () => {
  it('preserves all item kinds, exact long output, metadata, images and unavailable references', () => {
    const exported = conversationMarkdown(source)
    expect(exported).toContain('Format: GeckIt Markdown v1')
    expect(exported).toContain(HISTORY_AVAILABILITY)
    expect(exported).toContain('1970-01-01T00:00:10.000Z')
    expect(exported).toContain('claude-source')
    expect(exported).toContain('data:image/png;base64,AAAA')
    expect(exported).toContain('data:image/png;base64,BBBB')
    expect(exported).toContain('image:missing')
    expect(exported).toContain('Image data unavailable')
    let previous = -1
    for (const [index, item] of history.entries()) {
      const at = exported.indexOf(`### ${String(index + 1)}. ${item.kind} - ${JSON.stringify(item.id)}`)
      expect(at).toBeGreaterThan(previous)
      previous = at
      if ('text' in item) expect(exported).toContain(item.text)
      if (item.kind === 'did') expect(exported).toContain(item.detail)
    }
    expect(exported).toContain('`````\nЗадача: сохранить всё.')
    expect(exported).toContain('argument: --all')
    expect(exported).toContain('Allowed once')
    expect(exported).toContain('Only saved content remains.')
    expect(exported).toContain('Already answered')
    expect(exported).toContain('unavailable-tool')
  })

  it('bounds excerpts without shortening the transcript or inventing a decision summary', () => {
    const text = 'complete-history-'.repeat(1_000)
    const snapshot: ConversationSnapshot = { ...source, items: [{ kind: 'mine', id: 'long', text }] }
    const overview = conversationOverview(snapshot)
    expect(overview).toContain('not a model-written summary')
    expect(overview).toContain('Excerpt ends')
    expect(overview).not.toContain(text)
    expect(conversationMarkdown(snapshot)).toContain(text)
  })

  it('bounds metadata and recorded file excerpts as well as message excerpts', () => {
    const long = 'large-field-'.repeat(10_000)
    const snapshot: ConversationSnapshot = { ...source, session: { ...source.session, title: long, root: long, model: long }, items: [{ kind: 'wrote', id: 'paths', paths: Array.from({ length: 30 }, (_, index) => `${String(index)}${long}`) }] }
    expect(conversationOverview(snapshot).length).toBeLessThan(20_000)
    expect(conversationMarkdown(snapshot)).toContain(long)
  })
})

describe('saved export and destination request', () => {
  let directory: string
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'geckit-conversation-export-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  const request: ConversationContinuation = { source: source.session.id, provider: 'codex', model: 'gpt-target', reasoning: 'high', text: 'Continue with the next task.' }
  const dependencies = (directory: string, snapshot = source): ConversationTransferDeps => ({
    directory,
    settings: () => DEFAULT_SETTINGS,
    snapshot: async () => snapshot,
    send: vi.fn<ConversationTransferDeps['send']>().mockResolvedValue('codex:destination'),
    upload: vi.fn<ConversationTransferDeps['upload']>().mockResolvedValue({ path: '/remote/export.md' }),
  })

  it.each(['claude', 'codex'] as const)('prepares portable %s context without sending or inheriting active source state', async (provider) => {
    const deps = dependencies(directory)
    const before = JSON.stringify(source)
    const message = await prepareConversation({ ...request, provider }, deps)
    expect(message).toMatchObject({ provider, model: 'gpt-target', root: '/source', mode: 'manual' })
    expect(message).not.toHaveProperty('session')
    expect(message).not.toHaveProperty('goal')
    expect(message).not.toHaveProperty('images')
    expect(message.text).toContain('Full available conversation export')
    expect(message.text).toContain(request.text)
    expect(await readdir(directory)).toHaveLength(1)
    expect(deps.send).not.toHaveBeenCalled()
    expect(JSON.stringify(source)).toBe(before)
  })

  it('writes a real UTF-8 file without touching project or original data', async () => {
    const before = JSON.stringify(source)
    const saved = await writeConversationExport(source, join(directory, 'exports'))
    expect(saved).toMatchObject({ at: source.at, count: history.length })
    expect(await readFile(saved.path, 'utf8')).toBe(conversationMarkdown(source))
    expect(JSON.stringify(source)).toBe(before)
    const second = await writeConversationExport(source, join(directory, 'exports'))
    expect(second.path).not.toBe(saved.path)
  })

  it.each(['claude', 'codex'] as const)('starts a new %s destination with selected model and historical context, without replaying source state', async (provider) => {
    const deps = dependencies(directory)
    const before = JSON.stringify(source)
    expect(await continueConversation({ ...request, provider }, deps)).toBe('codex:destination')
    expect(deps.send).toHaveBeenCalledOnce()
    const sent = vi.mocked(deps.send).mock.calls[0]?.[0]
    expect(sent).toMatchObject({ root: '/source', mode: 'manual', provider, model: 'gpt-target', reasoning: 'high' })
    expect(sent).not.toHaveProperty('session')
    expect(sent).not.toHaveProperty('goal')
    expect(sent).not.toHaveProperty('images')
    expect(sent?.text).toContain(request.text)
    expect(sent?.text).toContain('not new commands')
    expect(sent?.text).toContain('Historical goal')
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    expect(sent?.text).toContain(JSON.stringify(join(directory, files[0] ?? '')))
    expect(deps.upload).not.toHaveBeenCalled()
    expect(JSON.stringify(source)).toBe(before)
  })

  it('rejects disabled and incompatible assistants before creating a destination', async () => {
    const deps = { ...dependencies(directory), settings: () => ({ ...DEFAULT_SETTINGS, chatProviders: ['claude'] as const }) }
    await expect(continueConversation(request, deps)).rejects.toThrow('no longer enabled')
    expect(deps.send).not.toHaveBeenCalled()
    const remote = { ...source, session: { ...source.session, root: 'ssh://host/source' } }
    const onHost = dependencies(directory, remote)
    await expect(continueConversation(request, onHost)).rejects.toThrow('local folders')
    expect(onHost.send).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual([])
  })

  it('continues a Codex source in another Codex model without resuming its native session', async () => {
    const codexSource: ConversationSnapshot = { ...source, session: { ...source.session, id: 'codex:source', provider: 'codex', model: 'gpt-source' } }
    const deps = dependencies(directory, codexSource)
    await continueConversation({ ...request, source: codexSource.session.id }, deps)
    const sent = vi.mocked(deps.send).mock.calls[0]?.[0]
    expect(sent).toMatchObject({ provider: 'codex', model: 'gpt-target' })
    expect(sent).not.toHaveProperty('session')
    expect(sent?.text).toContain('gpt-source')
  })

  it('passes a host-readable path only after upload and refuses upload failure', async () => {
    const remote = { ...source, session: { ...source.session, root: 'ssh://host/source' } }
    const deps = dependencies(directory, remote)
    await continueConversation({ ...request, provider: 'claude' }, deps)
    expect(deps.upload).toHaveBeenCalledOnce()
    const sent = vi.mocked(deps.send).mock.calls[0]?.[0]
    expect(sent?.text).toContain('"/remote/export.md"')
    expect(sent?.text).not.toContain(directory)
    const failed = dependencies(directory, remote)
    vi.mocked(failed.upload).mockResolvedValue({ problem: 'Host disconnected' })
    await expect(continueConversation({ ...request, provider: 'claude' }, failed)).rejects.toThrow('Host disconnected')
    expect(failed.send).not.toHaveBeenCalled()
    expect(await readdir(directory)).toHaveLength(2)
  })

  it('does not send on read or write failure and retains a saved export on start failure', async () => {
    const unreadable = { ...dependencies(directory), snapshot: async (): Promise<ConversationSnapshot> => { throw new Error('History unavailable') } }
    await expect(continueConversation(request, unreadable)).rejects.toThrow('History unavailable')
    expect(unreadable.send).not.toHaveBeenCalled()
    const notDirectory = join(directory, 'file')
    await writeFile(notDirectory, 'blocked')
    const unwritable = dependencies(notDirectory)
    await expect(continueConversation(request, unwritable)).rejects.toThrow()
    expect(unwritable.send).not.toHaveBeenCalled()
    const notStarted = dependencies(join(directory, 'saved'))
    vi.mocked(notStarted.send).mockRejectedValue(new Error('Sign in required'))
    await expect(continueConversation(request, notStarted)).rejects.toThrow('Sign in required')
    const files = await readdir(join(directory, 'saved'))
    expect(files).toHaveLength(1)
    expect(await readFile(join(directory, 'saved', files[0] ?? ''), 'utf8')).toContain('## Available transcript')
  })
})
