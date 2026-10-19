import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { providerOf } from '../shared/api'
import type { ChatSession, SessionMessage, SessionProvider, Settings } from '../shared/api'
import { isRemote } from '../shared/hosts'
import { llmProviderInfo } from '../shared/providers'
import { managerProjects } from '../shared/manager'
import { withColors } from '../shared/project-color'
import { requestedProvider } from '../cli/start'
import type { NotesStore, Sessions } from './sessions'

interface OperationDeps {
  readonly sessions: Sessions
  readonly notes: NotesStore
  readonly settings: () => Settings
  readonly saveSettings: (change: Partial<Settings>) => Settings
  readonly owner: string
  readonly managed: (id: string) => boolean
  readonly managerSession: () => string | undefined
}

export const MANAGER_CAPABILITIES = {
  interface: 'GeckIt CLI; arguments are literal strings, never shell syntax',
  commands: [
    'capabilities',
    'providers list',
    'providers models --provider <enabled-provider-id>',
    'projects list',
    'projects add --path <absolute-existing-local-folder>',
    'projects create --path <absolute-new-local-folder>',
    'projects remove --project <root-or-unambiguous-name> (user confirmation; keeps files)',
    'projects provider --project <root-or-unambiguous-name> [--provider <enabled-provider-id>|--clear]',
    'files list|read --project <project> --path <relative-path>',
    'files write --project <project> --path <relative-path> --text <contents>',
    'files mkdir --project <project> --path <relative-path>',
    'files move --project <project> --path <relative-path> --to <relative-path>',
    'files remove --project <project> --path <relative-path> (user confirmation; files or empty directories)',
    'sessions list [--managed]',
    'sessions show --id <full-session-id> [--last <1-30>]',
    'sessions start --project <project> --text <self-contained-assignment> --goal <completion-condition> [--title <title>] [--provider <enabled-provider-id>]',
    'sessions send --id <managed-worker-id> --text <correction-or-answer>',
    'sessions stop --id <managed-worker-id>',
    'sessions mark --id <managed-worker-id> --status progress|review|blocked|done (done needs confirmation)',
    'sessions attach --id <unrelated-worker-id> (user confirmation)',
    'sessions answer --id <managed-worker-id> --card <current-question-id> --text <answer> (user confirmation; questions only)',
    'settings show',
  ],
  unavailable: [
    { aspects: 'SSH project creation and remote file management', reason: 'Use a worker on the registered host; local file commands never fall back to this computer.' },
    { aspects: 'profiles, favorites, schedules, libraries, provider enable/install, hosts and other settings mutations', reason: 'This first Manager CLI version exposes their current settings but changes require the existing GeckIt UI.' },
    { aspects: 'arbitrary shell, native permission approval, deep code execution and direct provider API calls', reason: 'Outside Manager coordination. Delegate deep execution to workers; normal provider tools and permission checks remain available.' },
  ],
} as const

interface CommandShape {
  readonly domain: string
  readonly command: string
  readonly flags: readonly string[]
}

const SHAPES: readonly CommandShape[] = [
  { domain: 'providers', command: 'list', flags: [] },
  { domain: 'providers', command: 'models', flags: ['--provider'] },
  { domain: 'projects', command: 'list', flags: [] },
  { domain: 'projects', command: 'add', flags: ['--path'] },
  { domain: 'projects', command: 'create', flags: ['--path'] },
  { domain: 'projects', command: 'remove', flags: ['--project'] },
  { domain: 'projects', command: 'provider', flags: ['--project', '--provider', '--clear'] },
  ...['list', 'read', 'write', 'mkdir', 'move', 'remove'].map((command) => ({ domain: 'files', command, flags: ['--project', '--path', ...(command === 'write' ? ['--text'] : []), ...(command === 'move' ? ['--to'] : [])] })),
  { domain: 'sessions', command: 'list', flags: ['--managed'] },
  { domain: 'sessions', command: 'show', flags: ['--id', '--last'] },
  { domain: 'sessions', command: 'start', flags: ['--project', '--text', '--goal', '--title', '--provider'] },
  { domain: 'sessions', command: 'send', flags: ['--id', '--text'] },
  { domain: 'sessions', command: 'stop', flags: ['--id'] },
  { domain: 'sessions', command: 'mark', flags: ['--id', '--status'] },
  { domain: 'sessions', command: 'attach', flags: ['--id'] },
  { domain: 'sessions', command: 'answer', flags: ['--id', '--card', '--text'] },
  { domain: 'settings', command: 'show', flags: [] },
]

const values = (args: readonly string[]): Map<string, string> => {
  const shape = SHAPES.find((one) => one.domain === args[0] && one.command === args[1])
  if (shape === undefined) throw new Error('This GeckIt CLI operation is unavailable. Run capabilities for supported commands and limitations.')
  const parsed = new Map<string, string>()
  for (let at = 2; at < args.length; at++) {
    const flag = args[at] ?? ''
    if (flag !== '--json' && !shape.flags.includes(flag)) throw new Error(`Unsupported flag ${flag} for ${shape.domain} ${shape.command}.`)
    if (flag === '--json' || flag === '--managed' || flag === '--clear') { parsed.set(flag, 'true'); continue }
    if (!flag.startsWith('--') || args[at + 1] === undefined) throw new Error(`Unexpected argument: ${flag}`)
    if (parsed.has(flag)) throw new Error(`Repeated argument: ${flag}`)
    parsed.set(flag, args[++at] ?? '')
  }
  return parsed
}

const required = (flags: Map<string, string>, name: string): string => {
  const value = flags.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}. Use capabilities for the command format.`)
  return value
}

export function managerProvider(settings: Settings, root: string, override?: SessionProvider): { readonly provider: SessionProvider; readonly reason: 'task' | 'project' | 'default' } {
  const preference = settings.projectAssistants.find((one) => one.root === root)?.provider
  const provider = override ?? preference ?? settings.chatProvider
  if (!settings.chatProviders.includes(provider)) throw new Error(`Provider ${provider} is disabled. Choose an enabled assistant; no replacement was selected.`)
  const info = llmProviderInfo(provider, 'stream', settings.providerPlugins)
  if (provider.startsWith('plugin:') && !settings.providerPlugins.some((one) => one.id === provider)) throw new Error(`Provider ${provider} is not installed.`)
  if (isRemote(root) && info.localOnly === true) throw new Error(`${info.name} cannot run on this project's host. Choose another enabled assistant explicitly.`)
  return { provider, reason: override !== undefined ? 'task' : preference !== undefined ? 'project' : 'default' }
}

const within = (root: string, path: string): boolean => {
  const child = relative(root, path)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

export async function managerFile(root: string, named: string, create = false): Promise<string> {
  if (isRemote(root)) throw new Error('Remote file management is unavailable in this version. Delegate it to a worker on that host.')
  if (isAbsolute(named) || named.includes('\0')) throw new Error('Use a path relative to the registered project.')
  const pieces = named.split(/[\\/]/)
  const protectedPath = (parts: readonly string[]): boolean => parts.some((part) => ['.git', '.ssh', '.geckit', '.codex', '.claude', '.agents', 'agents.md', 'claude.md', 'geckit.md'].includes(part.toLowerCase()) || /^\.env(?:\.|$)/i.test(part) || /^(?:credentials|secrets)(?:\.|$)/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part))
  if (protectedPath(pieces)) throw new Error('Credential and tool configuration paths require the native UI or a worker’s permission checks.')
  const actualRoot = await realpath(root)
  const path = resolve(actualRoot, named)
  if (!within(actualRoot, path)) throw new Error('That path is outside the registered project.')
  const parent = await realpath(create ? dirname(path) : path)
  if (!within(actualRoot, parent)) throw new Error('That path follows a link outside the registered project.')
  if (protectedPath(relative(actualRoot, parent).split(/[\\/]/))) throw new Error('That link reaches a protected credential or tool configuration path.')
  const linked = await lstat(path).catch(() => undefined)
  if (linked?.isFile() === true && linked.nlink > 1) throw new Error('Hard-linked files require a worker’s permission checks.')
  if (create) {
    const existing = await lstat(path).catch(() => undefined)
    if (existing?.isSymbolicLink() === true) throw new Error('Writing through symbolic links requires a worker’s permission checks.')
  }
  return path
}

export class ManagerOperations {
  readonly #deps: OperationDeps
  constructor(deps: OperationDeps) { this.#deps = deps }

  confirmation(args: readonly string[], policy: 'automatic' | 'approve'): string | undefined {
    const [domain, command] = args
    if (domain === 'sessions' && command === 'start' && policy === 'approve') return `Start this worker? ${JSON.stringify(args)}`
    if (domain === 'sessions' && command === 'attach') return `Allow Manager to coordinate this existing conversation? ${JSON.stringify(args)}`
    if (domain === 'sessions' && command === 'answer') return `Send this answer to the worker's question? ${JSON.stringify(args)}`
    if (domain === 'sessions' && command === 'mark' && args.includes('done')) return `Accept this task as Done? ${JSON.stringify(args)}`
    if (domain === 'projects' && (command === 'add' || command === 'create')) return `Register this folder for Manager access? ${JSON.stringify(args)}`
    if ((domain === 'projects' || domain === 'files') && command === 'remove') return `Remove this ${domain === 'projects' ? 'project from GeckIt (files are kept)' : 'file or empty folder'}? ${JSON.stringify(args)}`
    return undefined
  }

  #project(named: string): string {
    const projects = managerProjects(this.#deps.settings())
    if (projects.includes(named)) return named
    const found = projects.filter((root) => basename(root) === named)
    if (found.length !== 1) throw new Error(found.length === 0 ? `No registered project called ${named}. Run projects list.` : `Several projects are called ${named}. Use the full project root.`)
    return found[0] ?? ''
  }

  async #worker(id: string, allowUnmanaged = false): Promise<ChatSession> {
    const projects = managerProjects(this.#deps.settings())
    const worker = (await this.#deps.sessions.list(projects)).find((one) => one.id === id)
    if (worker === undefined || worker.manager === true || !projects.includes(worker.project ?? worker.root)) throw new Error('That worker is not in a currently registered project.')
    if (!allowUnmanaged && !this.#deps.managed(id)) throw new Error('This conversation is not managed here. Request sessions attach and wait for user confirmation first.')
    return worker
  }

  async run(args: readonly string[], operation: string): Promise<string> {
    const [domain, command] = args
    if (domain === 'capabilities') {
      if (args.length !== 1) throw new Error('capabilities takes no arguments.')
      return JSON.stringify(MANAGER_CAPABILITIES)
    }
    const flags = values(args)
    const settings = this.#deps.settings()
    if (domain === 'providers') {
      if (command === 'list') return JSON.stringify(settings.chatProviders.map((provider) => ({ ...llmProviderInfo(provider, 'stream', settings.providerPlugins), enabled: true })))
      if (command === 'models') {
        const provider = requestedProvider(required(flags, '--provider'))
        if (provider === undefined || !settings.chatProviders.includes(provider)) throw new Error('Select an enabled provider from providers list.')
        return JSON.stringify(await this.#deps.sessions.models(undefined, provider) ?? [])
      }
    }
    if (domain === 'projects') {
      if (command === 'list') return JSON.stringify(managerProjects(settings).map((root) => ({ root, name: basename(root), provider: settings.projectAssistants.find((one) => one.root === root)?.provider ?? null, defaultProvider: settings.chatProvider })))
      if (command === 'add' || command === 'create') {
        const path = required(flags, '--path')
        if (!isAbsolute(path) || isRemote(path)) throw new Error('This command needs an absolute local folder path. Remote projects must be registered in GeckIt.')
        if (command === 'create') await mkdir(path, { recursive: false })
        if (!(await stat(path)).isDirectory()) throw new Error('That path is not a folder.')
        const root = await realpath(path)
        const projects = [root, ...settings.projects.filter((one) => one !== root)]
        this.#deps.saveSettings({ projects, profiles: settings.profiles.map((profile) => profile.id !== settings.profile || profile.projects.includes(root) ? profile : { ...profile, projects: [...profile.projects, root] }), projectColors: withColors({ projects, projectColors: settings.projectColors }) })
        return JSON.stringify({ root, added: true })
      }
      const root = this.#project(required(flags, '--project'))
      if (command === 'remove') {
        this.#deps.saveSettings({ projects: settings.projects.filter((one) => one !== root), profiles: settings.profiles.map((profile) => ({ ...profile, projects: profile.projects.filter((one) => one !== root) })), chatProjects: settings.chatProjects.filter((one) => one !== root), projectAssistants: settings.projectAssistants.filter((one) => one.root !== root) })
        return JSON.stringify({ root, removed: true, filesKept: true })
      }
      if (command === 'provider') {
        if (flags.has('--clear') && flags.has('--provider')) throw new Error('Choose either --provider or --clear, not both.')
        if (flags.has('--clear')) {
          this.#deps.saveSettings({ projectAssistants: settings.projectAssistants.filter((one) => one.root !== root) })
          return JSON.stringify({ root, provider: null })
        }
        if (!flags.has('--provider')) return JSON.stringify({ root, ...managerProvider(settings, root) })
        const provider = requestedProvider(required(flags, '--provider'))
        if (provider === undefined) throw new Error('Use a provider ID from providers list.')
        managerProvider(settings, root, provider)
        this.#deps.saveSettings({ projectAssistants: [...settings.projectAssistants.filter((one) => one.root !== root), { root, provider }] })
        return JSON.stringify({ root, provider, existingWorkersUnchanged: true })
      }
    }
    if (domain === 'files') {
      const root = this.#project(required(flags, '--project'))
      const path = await managerFile(root, flags.get('--path') ?? '.', command === 'write' || command === 'mkdir')
      if (command === 'list') return JSON.stringify((await readdir(path, { withFileTypes: true })).filter((entry) => !['.git', '.ssh', '.claude', '.codex', '.geckit'].includes(entry.name) && !/^\.env(?:\.|$)/.test(entry.name)).map((entry) => ({ name: entry.name, directory: entry.isDirectory(), link: entry.isSymbolicLink() })))
      if (command === 'read') {
        if ((await stat(path)).size > 100_000) throw new Error('That file is too large for compact Manager context. Delegate reading it to a worker.')
        return await readFile(path, 'utf8')
      }
      if (command === 'write') {
        const text = flags.get('--text')
        if (text === undefined || text.length > 100_000) throw new Error('Provide --text with at most 100000 characters. Delegate substantial content creation.')
        await writeFile(path, text, { flag: 'w' })
        return JSON.stringify({ path, written: true })
      }
      if (command === 'mkdir') { await mkdir(path); return JSON.stringify({ path, created: true }) }
      if (command === 'move') {
        const target = await managerFile(root, required(flags, '--to'), true)
        if (await lstat(target).catch(() => undefined) !== undefined) throw new Error('The target already exists. Choose another name.')
        if (path === await realpath(root)) throw new Error('Move files or folders inside the project; do not move its registered root.')
        await rename(path, target)
        return JSON.stringify({ path, target, moved: true })
      }
      if (command === 'remove') {
        if (path === await realpath(root)) throw new Error('Removing the project folder itself is outside this command.')
        await rm(path, { recursive: false })
        return JSON.stringify({ path, removed: true })
      }
    }
    if (domain === 'sessions') {
      if (command === 'list') {
        const all = (await this.#deps.sessions.list(managerProjects(settings))).filter((one) => one.question !== true && (!flags.has('--managed') || this.#deps.managed(one.id)))
        return JSON.stringify(all.map((one) => ({ id: one.id, root: one.root, title: one.title, state: one.state, status: one.status, provider: providerOf(one.id), summary: one.stands, managed: this.#deps.managed(one.id), queued: one.queued?.length ?? 0 })))
      }
      if (command === 'start') {
        const root = this.#project(required(flags, '--project'))
        const explicit = flags.get('--provider')
        const provider = explicit === undefined ? undefined : requestedProvider(explicit)
        if (explicit !== undefined && provider === undefined) throw new Error('Use a provider ID from providers list.')
        const resolved = managerProvider(settings, root, provider)
        const text = required(flags, '--text')
        const goal = required(flags, '--goal')
        const message: SessionMessage = { root, provider: resolved.provider, mode: settings.chatMode, text, goal, ...(resolved.provider === 'claude' && settings.chatModel !== '' ? { model: settings.chatModel } : resolved.provider === 'codex' && settings.codexModel !== '' ? { model: settings.codexModel, reasoning: settings.codexReasoning } : {}) }
        const id = await this.#deps.sessions.startManaged(message, this.#deps.owner, operation, this.#deps.managerSession())
        if (flags.has('--title')) this.#deps.sessions.rename(id, required(flags, '--title'))
        const worker = await this.#worker(id)
        return JSON.stringify({ id, provider: resolved.provider, providerReason: resolved.reason, state: worker.waits === true || (worker.queued?.length ?? 0) > 0 ? 'queued' : worker.state, goal })
      }
      const id = required(flags, '--id')
      const worker = await this.#worker(id, command === 'attach' || command === 'show')
      if (command === 'attach') {
        const note = this.#deps.notes.all()[id] ?? {}
        this.#deps.notes.set(id, { ...note, managerOwner: this.#deps.owner })
        return JSON.stringify({ id, attached: true })
      }
      if (command === 'show') {
        const count = Number(flags.get('--last') ?? 10)
        if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('--last must be an integer from 1 to 30.')
        return JSON.stringify({ id, state: worker.state, items: (await this.#deps.sessions.items(id)).filter((item) => item.kind === 'mine' || item.kind === 'theirs' || item.kind === 'card' || item.kind === 'note').slice(-count) })
      }
      if (command === 'send') {
        const provider = providerOf(id)
        if (!settings.chatProviders.includes(provider)) throw new Error(`Worker provider ${provider} is disabled. No replacement was selected.`)
        await this.#deps.sessions.send({ session: id, root: worker.root, provider, mode: worker.mode, text: required(flags, '--text'), ...(worker.chosen === undefined ? {} : { model: worker.chosen }) })
        return JSON.stringify({ id, delivered: true, busyBefore: worker.state === 'working' || worker.state === 'asks' })
      }
      if (command === 'stop') { this.#deps.sessions.stop(id); return JSON.stringify({ id, stopRequested: true }) }
      if (command === 'mark') {
        const status = required(flags, '--status')
        if (status !== 'progress' && status !== 'review' && status !== 'blocked' && status !== 'done') throw new Error('Status must be progress, review, blocked or done.')
        this.#deps.sessions.mark(id, status === 'progress' ? undefined : status)
        return JSON.stringify({ id, status })
      }
      if (command === 'answer') {
        const cardId = required(flags, '--card')
        const card = (await this.#deps.sessions.items(id)).find((item) => item.id === cardId)
        if (card?.kind !== 'card' || card.card.kind !== 'question' || card.card.answered !== undefined) throw new Error('That question is no longer awaiting an answer. Native permissions require the user’s bound Telegram buttons or the GeckIt UI; the Manager CLI cannot approve them.')
        await this.#deps.sessions.answer(id, cardId.replace(/^card:/, ''), required(flags, '--text'))
        return JSON.stringify({ id, card: cardId, answered: true })
      }
    }
    if (domain === 'settings' && command === 'show') return JSON.stringify({ theme: settings.theme, workingAtOnce: settings.workingAtOnce, defaultProvider: settings.chatProvider, projects: settings.projects, projectAssistants: settings.projectAssistants, profiles: settings.profiles, favorites: settings.favorites, hosts: settings.hosts.map(({ id, name }) => ({ id, name })), schedules: settings.shortcuts.map(({ id, name, on }) => ({ id, name, on })) })
    throw new Error('This GeckIt CLI operation is unavailable. Run capabilities for supported commands and limitations.')
  }
}
