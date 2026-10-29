import type { Geckit } from '../../../src/preload'
import { DEFAULT_SETTINGS, providerOf } from '../../../src/shared/api'
import type { ChatSession, ClaudeAccount, ClaudeModel, ConversationContinuation, ConversationExport, FileShown, PreparedConversationDraft, SessionItem, SessionItems, SessionMessage, Settings } from '../../../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'
import type { ManagerView } from '../../../src/shared/manager'

const project = '/Fixtures/GeckIt export'
export const source: ChatSession = {
  id: 'fixture-source', root: project, title: 'Source conversation', provider: 'claude', model: 'sonnet', chosen: 'sonnet',
  state: 'idle', stands: 'History and unsent draft stay in this conversation.', at: 1_793_238_000_000, mode: 'manual', here: true,
  goal: { condition: 'Source goal stays here', checks: 1 },
  queued: [{ id: 'source-queued', text: 'Queued source instruction stays here.', images: 0 }],
}
export const sourceDraft = 'Unsent source draft: preserve me.'
export const sourceItems: readonly SessionItem[] = [
  { kind: 'mine', id: 'request', text: 'Build a Markdown export and continue this work with another model.', at: source.at },
  { kind: 'theirs', id: 'decision', text: 'Keep a readable transcript. Do not copy runnable goals or queued work.', phase: 'final_answer' },
  { kind: 'did', id: 'tool', what: 'Read docs/ux/conversation-export.md', detail: 'Synthetic tool output with ``` fences and <markup>.', path: 'docs/ux/conversation-export.md' },
  { kind: 'note', id: 'summary', note: 'summarised', text: 'Earlier content was compacted. Only available history can be transferred.' },
  { kind: 'theirs', id: 'latest', text: 'Ready for the next model. This is synthetic fixture history.', phase: 'final_answer' },
]

interface ModelRequest { readonly root: string | undefined; readonly provider: SessionMessage['provider'] }
interface FileRequest { readonly root: string; readonly path: string }
interface BoundarySend { readonly channel: string; readonly values: readonly (string | boolean | null | undefined)[] }
interface DestinationContext { readonly request: ConversationContinuation; readonly exported: ConversationExport }
type PreparedFixture = DestinationContext & { readonly session: ChatSession; readonly text: SessionMessage['text'] }
interface SavedDraft { readonly id: ChatSession['id']; readonly change: PreparedConversationDraft }
type FixtureEventValue = Settings | readonly ChatSession[] | SessionItems | string
type FixtureListener = (event: Event, value: FixtureEventValue) => void
type BoundaryArgument = string | boolean | Partial<Settings> | ConversationContinuation | SessionMessage | PreparedConversationDraft
type BoundaryResponse = Settings | readonly ChatSession[] | readonly SessionItem[] | readonly ClaudeModel[] | ClaudeAccount | ManagerView | ConversationExport | FileShown | string | boolean | { readonly working: number; readonly limit: number } | undefined

export const fixture = {
  exports: [] as ConversationExport[],
  exportRequests: [] as string[],
  continuations: [] as ConversationContinuation[],
  copies: [] as ConversationContinuation[],
  prepared: [] as PreparedFixture[],
  savedDrafts: [] as SavedDraft[],
  messageSends: [] as SessionMessage[],
  providerCreates: 0,
  providerSends: 0,
  queueAdds: 0,
  destinations: [] as ChatSession[],
  modelRequests: [] as ModelRequest[],
  openedFiles: [] as FileRequest[],
  sends: [] as BoundarySend[],
  unexpectedCalls: [] as string[],
  failExport: false,
  failCreate: false,
  failCopy: false,
  failModels: false,
  holdActions: false,
  holdModels: false,
  pendingActions: 0,
  pendingModels: 0,
  subscriptions: new Map<string, Set<FixtureListener>>(),
}

let settings: Settings = {
  ...DEFAULT_SETTINGS, projects: [project], chatProjects: [project], chatView: 'list',
  theme: new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light',
  analyticsAsked: true, newTaskRoot: project, chatMode: 'manual', vpnIpCheck: false,
  chatProviders: ['claude', 'codex'], chatProvider: 'claude', chatModel: 'sonnet', codexModel: 'gpt-fixture',
}
const actionWaiters = new Set<() => void>()
const modelWaiters = new Set<() => void>()
const destinationContexts = new Map<ChatSession['id'], DestinationContext>()
const STORAGE = 'conversation-export-fixture'
type StoredFixture = Pick<typeof fixture, 'exports' | 'exportRequests' | 'continuations' | 'copies' | 'prepared' | 'savedDrafts' | 'messageSends' | 'providerCreates' | 'providerSends' | 'queueAdds' | 'destinations'> & {
  readonly contexts: readonly (readonly [ChatSession['id'], DestinationContext])[]
}
const restore = localStorage.getItem(STORAGE)
if (restore !== null) {
  const stored = JSON.parse(restore) as StoredFixture
  fixture.exports = stored.exports
  fixture.exportRequests = stored.exportRequests
  fixture.continuations = stored.continuations
  fixture.copies = stored.copies
  fixture.prepared = stored.prepared
  fixture.savedDrafts = stored.savedDrafts
  fixture.messageSends = stored.messageSends
  fixture.providerCreates = stored.providerCreates
  fixture.providerSends = stored.providerSends
  fixture.queueAdds = stored.queueAdds
  fixture.destinations = stored.destinations
  for (const [id, context] of stored.contexts) destinationContexts.set(id, context)
}
const persist = (): void => {
  const stored: StoredFixture = { ...fixture, contexts: [...destinationContexts] }
  localStorage.setItem(STORAGE, JSON.stringify(stored))
}
const allSessions = (): readonly ChatSession[] => [source, ...fixture.prepared.map((one) => one.session), ...fixture.destinations]
const emit = (channel: string, value: FixtureEventValue): void => {
  for (const listener of fixture.subscriptions.get(channel) ?? []) listener(new Event(channel), value)
}
export function releasePending(): void {
  fixture.holdActions = false
  fixture.holdModels = false
  for (const release of actionWaiters) release()
  for (const release of modelWaiters) release()
  actionWaiters.clear()
  modelWaiters.clear()
}
const waitForActions = async (): Promise<void> => {
  if (!fixture.holdActions) return
  fixture.pendingActions++
  await new Promise<void>((resolve) => actionWaiters.add(resolve))
  fixture.pendingActions--
}
const models = async (root: ModelRequest['root'], provider: ModelRequest['provider']): Promise<readonly ClaudeModel[] | undefined> => {
  fixture.modelRequests.push({ root, provider })
  if (fixture.holdModels) {
    fixture.pendingModels++
    await new Promise<void>((resolve) => modelWaiters.add(resolve))
    fixture.pendingModels--
  }
  if (fixture.failModels) return undefined
  return provider === 'codex'
    ? [{ value: 'gpt-fixture', name: 'GPT fixture', isDefault: true, reasoning: [{ value: 'medium', says: 'Medium' }, { value: 'high', says: 'High' }], defaultReasoning: 'medium' }, { value: 'gpt-unavailable', name: 'Unavailable GPT', disabled: true, says: 'Synthetic account cannot run this model.' }]
    : [{ value: 'sonnet', name: 'Sonnet fixture', isDefault: true }, { value: 'opus', name: 'Opus fixture' }, { value: 'claude-unavailable', name: 'Unavailable Claude', disabled: true, says: 'Synthetic account cannot run this model.' }]
}
const saveExport = (): ConversationExport => {
  const saved: ConversationExport = { path: `/Fixtures/GeckIt exports/source-${fixture.exports.length + 1}.md`, at: Date.now(), count: sourceItems.length }
  fixture.exports.push(saved)
  persist()
  return saved
}
const idFor = (provider: SessionMessage['provider'], name: string): ChatSession['id'] => `${provider === 'codex' ? 'codex:' : provider?.startsWith('plugin:') === true ? `${provider}:` : ''}${name}`
const preparedText = (request: ConversationContinuation, exported: ConversationExport): SessionMessage['text'] => `Continue from this available conversation history.\n\nContext overview (metadata and excerpts)\n\nSource: ${source.title}\nProject: ${source.root}\n\nHistory is saved as Markdown at ${exported.path}. Read that file for the full available history before continuing.\n\n${sourceItems.filter((item): item is Extract<SessionItem, { kind: 'mine' | 'theirs' }> => item.kind === 'mine' || item.kind === 'theirs').map((item) => `${item.kind === 'mine' ? 'User' : 'Assistant'}: ${item.text}`).join('\n\n')}\n\nNext instruction:\n${request.text}`
const exportedMarkdown = (): string => `# Source conversation\n\nSynthetic browser fixture: no disk write or provider request occurred.\n\n## Available history\n\n${sourceItems.map((item) => 'text' in item ? `### ${item.kind}\n\n${item.text}` : item.kind === 'did' ? `### Tool\n\n${item.what}\n\n${item.detail ?? ''}` : '').join('\n\n')}`

export const contextBridge = {
  exposeInMainWorld: (_name: string, api: Geckit): void => { Object.defineProperty(window, 'geckit', { value: api }) },
}
export const webUtils = { getPathForFile: (file: File): string => `/Fixtures/${file.name}` }
export const ipcRenderer = {
  invoke: async (channel: string, first?: BoundaryArgument, second?: string | PreparedConversationDraft): Promise<BoundaryResponse> => {
    if (channel === 'settings:get') return settings
    if (channel === 'settings:set') {
      if (typeof first === 'object' && !('source' in first)) settings = { ...settings, ...first }
      emit('settings:changed', settings)
      return settings
    }
    if (channel === 'chat:list') return allSessions()
    if (channel === 'chat:account') return { here: true, signedIn: true, plan: 'Fixture plan' }
    if (channel === 'lineup:state') return { working: 0, limit: 6 }
    if (channel === 'manager:view') return { config: DEFAULT_MANAGER_CONFIG, queued: 0, state: 'off', workers: [], activity: [], providers: [], decisions: [] }
    if (channel === 'chat:models') return models(typeof first === 'string' ? first : undefined, second === 'codex' ? 'codex' : 'claude')
    if (channel === 'chat:items') {
      if (first === source.id) return sourceItems
      const context = typeof first === 'string' ? destinationContexts.get(first) : undefined
      return context === undefined ? [] : [{ kind: 'mine', id: `${String(first)}-context`, text: `Continue from the exported conversation.\n\nExport: ${context.exported.path}\n\n${context.request.text ?? ''}` }, { kind: 'theirs', id: `${String(first)}-ready`, text: 'Synthetic destination accepted. No provider was called.' }]
    }
    if (channel === 'chat:preparedDraft') return fixture.prepared.find((one) => one.session.id === first)?.text
    if (channel === 'chat:savePreparedDraft') {
      if (typeof first !== 'string' || typeof second !== 'object') throw new Error('Fixture draft save requires an id and typed change.')
      fixture.savedDrafts.push({ id: first, change: second })
      fixture.prepared = fixture.prepared.map((one) => one.session.id !== first ? one : {
        ...one,
        text: second.text ?? one.text,
        session: { ...one.session, ...(second.model === undefined ? {} : { chosen: second.model }), ...(second.reasoning === undefined ? {} : { reasoning: second.reasoning }) },
      })
      persist()
      emit('chat:sessions', allSessions())
      return undefined
    }
    if (channel === 'chat:exportConversation') {
      if (typeof first !== 'string') throw new Error('Fixture export requires a source id.')
      fixture.exportRequests.push(first)
      persist()
      await waitForActions()
      if (fixture.failExport) throw new Error('Fixture export failed: destination folder is not writable.')
      return saveExport()
    }
    if (channel === 'chat:copyConversation') {
      if (typeof first !== 'object' || !('source' in first)) throw new Error('Fixture copy requires a typed request.')
      fixture.copies.push(first)
      persist()
      await waitForActions()
      if (fixture.failExport) throw new Error('Fixture export failed: destination folder is not writable.')
      const exported = saveExport()
      if (fixture.failCopy) throw new Error('Fixture copy failed: prepared conversation could not be saved.')
      const id = idFor(first.provider, `copy-fixture-${fixture.copies.length}`)
      const session: ChatSession = {
        id, root: source.root, title: `Prepared copy for ${first.provider}`, provider: first.provider, prepared: true,
        state: 'idle', stands: 'Prepared context. Nothing sent.', at: Date.now(), mode: source.mode, here: true,
        ...(first.model === undefined ? {} : { chosen: first.model, model: first.model }),
        ...(first.reasoning === undefined ? {} : { reasoning: first.reasoning }),
      }
      fixture.prepared.push({ session, text: preparedText(first, exported), request: first, exported })
      persist()
      emit('chat:sessions', allSessions())
      return id
    }
    if (channel === 'chat:continueConversation') {
      if (typeof first !== 'object' || !('source' in first)) throw new Error('Fixture continuation requires a typed request.')
      fixture.continuations.push(first)
      persist()
      await waitForActions()
      if (fixture.failExport) throw new Error('Fixture export failed: destination folder is not writable.')
      const exported = saveExport()
      if (fixture.failCreate) throw new Error('Fixture creation failed: assistant is temporarily unavailable.')
      const id = idFor(first.provider, `fixture-destination-${fixture.destinations.length + 1}`)
      const destination: ChatSession = {
        id, root: source.root, title: `Continued with ${first.provider}`, provider: first.provider,
        state: 'idle', stands: 'Synthetic destination accepted.', at: Date.now(), mode: source.mode, here: true,
        ...(first.model === undefined ? {} : { model: first.model, chosen: first.model }),
        ...(first.reasoning === undefined ? {} : { reasoning: first.reasoning }),
      }
      fixture.destinations.push(destination)
      fixture.providerCreates++
      fixture.providerSends++
      destinationContexts.set(id, { request: first, exported })
      persist()
      emit('chat:sessions', allSessions())
      return id
    }
    if (channel === 'chat:send') {
      if (typeof first !== 'object' || !('root' in first) || !('text' in first) || !('mode' in first)) throw new Error('Fixture send requires a typed message.')
      fixture.messageSends.push(first)
      persist()
      await waitForActions()
      if (fixture.failCreate) throw new Error('Fixture send failed: assistant is temporarily unavailable.')
      const prepared = fixture.prepared.find((one) => one.session.id === first.session)
      fixture.providerSends++
      if (prepared === undefined) { persist(); return first.session ?? source.id }
      const provider = first.provider ?? prepared.session.provider ?? providerOf(prepared.session.id)
      const id = idFor(provider, `fixture-destination-${fixture.destinations.length + 1}`)
      const { prepared: _prepared, ...metadata } = prepared.session
      fixture.destinations.push({ ...metadata, id, title: `Sent copy to ${provider}`, stands: 'Synthetic edited context accepted.', at: Date.now(), ...(first.model === undefined ? {} : { chosen: first.model, model: first.model }) })
      fixture.providerCreates++
      destinationContexts.set(id, { exported: prepared.exported, request: { ...prepared.request, text: first.text } })
      fixture.prepared = fixture.prepared.filter((one) => one.session.id !== prepared.session.id)
      persist()
      emit('chat:sessions', allSessions())
      return id
    }
    if (channel === 'chat:file') {
      fixture.openedFiles.push({ root: typeof first === 'string' ? first : '', path: typeof second === 'string' ? second : '' })
      return { kind: 'markdown', text: exportedMarkdown() }
    }
    if (channel === 'settings:accessibility' || channel === 'chat:exists') return true
    if (['chat:plans', 'chat:cutOff', 'chat:links', 'chat:files', 'chat:commands', 'hosts:list', 'hosts:prompts'].includes(channel)) return []
    if (['chat:plan', 'chat:git', 'chat:repo', 'chat:waiting', 'errors:question'].includes(channel)) return undefined
    fixture.unexpectedCalls.push(channel)
    throw new Error(`Unconfigured fixture IPC: ${channel}`)
  },
  send: (channel: string, ...values: readonly (string | boolean | null | undefined)[]): void => {
    fixture.sends.push({ channel, values })
    if (channel === 'chat:openFile') fixture.openedFiles.push({ root: String(values[0] ?? ''), path: String(values[1] ?? '') })
  },
  on: (channel: string, listener: FixtureListener): void => {
    const listeners = fixture.subscriptions.get(channel) ?? new Set<FixtureListener>()
    listeners.add(listener)
    fixture.subscriptions.set(channel, listeners)
  },
  off: (channel: string, listener: FixtureListener): void => { fixture.subscriptions.get(channel)?.delete(listener) },
}
