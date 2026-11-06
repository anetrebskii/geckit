import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SessionItem, Settings } from '../shared/api'
import { DEFAULT_SETTINGS } from '../shared/api'
import type { Json } from '../shared/elicitation'
import type { ManagerHistoryRequest, ManagerView } from '../shared/manager'
import { configureCorePlatform } from '../core/platform'
import { Manager } from './manager'
import { managerHistoryItem } from './manager-protocol'
import { notesStore } from './store'
import { Sessions } from './sessions'
import type { ClaudeOptions } from './sessions/claude'

/** Disposable browser/test adapter: all transcript deletion stays inside its temporary directory. */
export async function createHistoryPreview() {
  const directory = await mkdtemp(join(tmpdir(), 'geckit-manager-history-preview-'))
  const project = join(directory, 'project')
  const transcripts = join(directory, 'transcripts')
  await mkdir(project); await mkdir(transcripts)
  await writeFile(join(project, 'sentinel.txt'), 'Keep project files')
  configureCorePlatform({ directory: () => directory, source: () => true, headless: true })
  let settings: Settings = { ...DEFAULT_SETTINGS, projects: [project], chatProviders: ['claude'], chatProvider: 'claude', vpnIpCheck: false }
  const native: Pick<ClaudeOptions, 'id' | 'resume'>[] = []
  const inputs: { readonly id: string; readonly text: string }[] = []
  const removed: string[] = []
  const ended: string[] = []
  let failing = false
  let manager: Manager
  let sessions: Sessions
  let notes = notesStore()
  const path = (id: string): string => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Fixture transcript ID rejected.')
    return join(transcripts, `${id}.json`)
  }
  const read = async (id: string): Promise<SessionItem[]> => JSON.parse(await readFile(path(id), 'utf8')) as SessionItem[]
  const start = (): void => {
    sessions = new Sessions({ notes,
      changed: (rows) => manager?.observeSessions(rows), items: () => undefined, account: () => undefined, notify: () => undefined,
      claudeAccount: async () => ({ here: true, signedIn: true }), claudeProgram: async () => undefined,
      usage: async () => ({ windows: new Map<string, number | undefined>() }),
      disk: {
        list: async () => Promise.all((await readdir(transcripts)).filter((name) => name.endsWith('.json')).map(async (name) => ({ id: name.slice(0, -5), title: 'Manager fixture', stands: '', at: 1, driven: true }))),
        has: async (_root, id) => read(id).then(() => true, () => false),
        read: async (_root, id) => read(id).then((items) => ({ items, tasks: [] }), () => undefined),
        delete: async (_root, id) => { if (failing) return false; await rm(path(id), { force: true }); removed.push(id); return true },
      },
      claude: (options, hear) => {
        native.push({ id: options.id, resume: options.resume })
        let writing = Promise.resolve()
        return { send: (text) => {
          const visible = managerHistoryItem({ kind: 'mine', id: crypto.randomUUID(), text })
          inputs.push({ id: options.id, text })
          writing = writing.then(() => read(options.id).catch(() => [])).then(async (items) => { await writeFile(path(options.id), JSON.stringify([...items, visible])); hear({ items: [visible], gone: [], signals: [] }) })
        }, answer: () => undefined, stop: () => undefined, end: async () => { await writing; ended.push(options.id) } }
      },
    })
    manager = new Manager({ directory, sessions, notes, settings: () => settings, saveSettings: (change) => settings = { ...settings, ...change }, cli: async () => '{}' })
  }
  start()
  await manager!.configure({ enabled: true })
  const telegram = manager!.thread({ channel: 'telegram', place: 'Telegram', key: 'fixture-chat', title: 'Alex fixture', from: 'Alex' })
  const slack = manager!.thread({ channel: 'channel:slack', place: 'Slack', key: 'fixture-channel:1', title: 'Planning fixture', from: 'Sam' })
  for (const thread of ['main', telegram, slack]) {
    await manager!.send(`Private old ${thread} history`, 'desktop', undefined, [], () => true, [], [], thread)
    await manager!.send(`Queued old ${thread} follow-up`, 'desktop', undefined, [], () => true, [], [], thread)
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 30))
  const json = (value: ManagerView | Awaited<ReturnType<Manager['inspect']>> | Awaited<ReturnType<Manager['sendApp']>>): Json => JSON.parse(JSON.stringify(value)) as Json
  return {
    directory,
    call: async (method: string, args: readonly Json[] = []): Promise<Json> => {
      if (method === 'view') return json(await manager!.view())
      if (method === 'inspect' && typeof args[0] === 'string') return json(await manager!.inspect(args[0]))
      if (method === 'history') {
        const request = args[0] as ManagerHistoryRequest
        return json(await manager!.history(request))
      }
      if (method === 'send') return json(await manager!.sendApp(args[0] as Parameters<Manager['sendApp']>[0]))
      if (method === 'restart') {
        manager!.dispose(); sessions!.dispose(); notes = notesStore(); start()
        return json(await manager!.view())
      }
      if (method === 'failure') { failing = args[0] === true; return failing }
      if (method === 'ledger') return JSON.parse(JSON.stringify({ directory, transcripts: await readdir(transcripts), native, inputs, removed, ended, manager: JSON.parse(await readFile(join(directory, 'manager.json'), 'utf8')) as Json, notes: notes.all(), sentinel: await readFile(join(project, 'sentinel.txt'), 'utf8') })) as Json
      throw new Error('Unknown fixture method.')
    },
    dispose: async (): Promise<void> => { manager!.dispose(); sessions!.dispose(); await rm(directory, { recursive: true, force: true }) },
  }
}
