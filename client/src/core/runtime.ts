import { ShortcutRuns } from '../main/shortcut-runs'
import { providerSettings } from '../main/provider-settings'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { ChatSession, Lineup } from '../shared/api'
import type { ManagerConfig, ManagerView } from '../shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../shared/manager-intake'
import { classifyIntake } from '../main/intake-classify'
import { correct, stopCorrecting } from '../main/correct'
import { checkVpnIp } from '../main/vpn-ip'
import { VoiceMemosSource } from '../main/voice-memos'
import { localTranscriptionReadiness } from '../main/local-transcription'
import { transcribeInstalledFile } from '../main/transcribe'
import { installedSpeechModel, onSpeechModel, whisperCli } from '../main/whisper'
import { stopFindModelDownload } from '../cli/find-model'
import { sweepRecordings } from '../main/recordings'
import { ChannelAttachments } from '../main/channel-attachments'
import { Shares } from '../main/shares'
import type { HostsDeps } from '../main/hosts/hosts'
import { hostTerminal } from '../main/hosts/route'
import { Plans } from '../main/plans'
import { updateInstalledPlugins } from '../main/sessions/plugins'
import type { PluginUpdateResult } from '../shared/providers'
import { coreEvents } from './events'
import { installedChannels } from '../main/channels/libraries'
import { Channels, restoreChannelManager } from '../main/channels/channels'
import type { ChannelVault } from '../main/channels/channels'

import { Employees } from '../main/employees'
import { keepBrowserBridge, setGuideEmployees, setGuideManager, syncEmployeeGuides } from '../main/guide'
import { browserBridgeOn } from '../cli/browser'
import { stopCamoufoxPreparation } from '../cli/camoufox'
import { Manager, runManagerCli } from '../main/manager'
import { projectSaid } from '../main/orders'
import { postponeShortcut, removeShortcut, resumeOwned, runShortcut, saveShortcut, startShortcuts } from '../main/shortcuts'
import { forgetRoots, getSettings, notesStore, onSettings, rememberProject, setSettings } from '../main/store'
import type { Sessions } from '../main/sessions'
import { hostOf, isRemote } from '../shared/hosts'
import { managerProjects } from '../shared/manager'
import { keptOrder } from '../shared/order'
import { createCoreHosts } from './hosts'
import { dataDirectory } from './platform'
import { createCoreSessions } from './sessions'
import { registerProjectBrowserConversation } from '../cli/browser-lifecycle'

export interface RuntimeOptions {
  readonly vault?: ChannelVault
  readonly secrets?: HostsDeps['secrets']
}

export async function createRuntime(cliScript: string, options: RuntimeOptions = {}) {
  let cliTargets: { readonly run: (host: string, args: readonly string[], authorized: () => boolean) => Promise<string>; readonly local: (args: readonly string[]) => Promise<string>; readonly registry: (args: readonly string[]) => string; readonly list: () => readonly { readonly id: string; readonly name: string }[] } | undefined
  const events = coreEvents()
  let all: readonly ChatSession[] = []
  let lineup: Lineup = { working: 0, limit: 0 }
  let plans: Plans | undefined
  let channels: Channels | undefined
  const hostWasUp = new Map<string, boolean>()
  const shares = new Shares({
    changed: () => { events.emit('peer:shares', shares.rooms()); channels?.sharesChanged() },
    ended: (id) => channels?.shareEnded(id),
  })
  const directory = dataDirectory()
  const notes = notesStore()
  let sessions: Sessions | undefined
  let shortcutRuns: ShortcutRuns | undefined
  let manager: Manager | undefined
  const routes = createCoreHosts({
    folder: join(directory, 'hosts'),
    executable: process.execPath,
    hosts: () => getSettings().hosts,
    save: (hosts) => setSettings({ hosts }),
    forgetProjects: (id) => {
      forgetRoots((root) => hostOf(root) === id)
      for (const shortcut of getSettings().shortcuts.filter((one) => hostOf(one.root) === id)) removeShortcut(shortcut.id)
      for (const [session, run] of Object.entries(routes.runs.all())) if (run.host === id) routes.runs.delete(session)
      const removed = sessions?.ids((root) => hostOf(root) === id) ?? []
      const favorites = getSettings().favorites
      if (favorites.some((one) => removed.includes(one))) setSettings({ favorites: favorites.filter((one) => !removed.includes(one)) })
      void routes.disk.forget(id)
    },
    remember: rememberProject,
    changed: (views) => {
      for (const view of views) {
        const was = hostWasUp.get(view.id)
        hostWasUp.set(view.id, view.state === 'up')
        if (was === true || view.state !== 'up') continue
        const roots = getSettings().projects.filter((root) => hostOf(root) === view.id)
        if (roots.length > 0) void sessions?.refresh(roots)
        plans?.hostUp(view.id)
      }
      events.emit('hosts:changed', views)
    },
    prompt: (prompt) => events.emit('hosts:prompt', prompt),
    answered: (id) => events.emit('hosts:answered', id),
    checks: (lines) => events.emit('hosts:checks', lines),
    secrets: options.secrets ?? { can: () => false, get: () => undefined, set: () => undefined, forget: () => undefined, has: () => false },
  })
  const hostNamed = (id: string): string | undefined => routes.hosts.config(id)?.name
  const employees = new Employees({
    directory,
    changed: (view) => events.emit('employees:changed', view),
    sync: (catalog) => syncEmployeeGuides(getSettings(), catalog),
    assignment: (id) => sessions?.employeeAssignment(id),
    sources: (id) => sessions?.employeeSources(id, managerProjects(getSettings())) ?? Promise.resolve([]),
    items: (source) => sessions?.employeeItems(source) ?? Promise.resolve(undefined),
    restored: resumeOwned,
    team: {
      settings: getSettings,
      project: (name) => {
        const root = getSettings().projects.find((one) => projectSaid(one, hostNamed) === name)
        if (root === undefined) throw new Error(`No folder called ${name}.`)
        return root
      },
      projectName: (root) => projectSaid(root, hostNamed),
      saveShortcut, postponeShortcut, removeShortcut,
      runShortcut: (id) => runShortcut(id, 'hand'),
      assign: (id, employee) => sessions?.assignEmployee(id, employee),
      title: (id) => notes.all()[id]?.title,
      ask: (id, lines, gone) => sessions === undefined ? Promise.reject(new Error('GeckIt is not ready yet.')) : sessions.teamRequest(id, lines, gone),
      manager: () => ({ instructions: manager?.instructions() ?? '', avatar: getSettings().managerAvatar }),
      setManager: async ({ instructions, avatar }) => {
        if (instructions !== undefined) await manager?.configure({ instructions })
        if (avatar !== undefined) setSettings({ managerAvatar: avatar })
      },
    },
  })
  let providerUpdateCheck: Promise<PluginUpdateResult> | undefined
  let providerUpdateTimer: NodeJS.Timeout | undefined
  let channelUpdateTimer: NodeJS.Timeout | undefined
  const checkProviderUpdates = async (): Promise<PluginUpdateResult> => {
    if (providerUpdateCheck !== undefined) return providerUpdateCheck
    providerUpdateCheck = updateInstalledPlugins().then((result) => {
      const installed = new Set<string>(getSettings().providerPlugins.map((one) => one.id))
      const ready = result.ready.filter((id) => installed.has(id))
      if (ready.length > 0) setSettings({ providerUpdatesReady: [...new Set([...getSettings().providerUpdatesReady, ...ready])] })
      return result
    })
    try { return await providerUpdateCheck } finally { providerUpdateCheck = undefined }
  }
  let stopSpeech: (() => void) | undefined
  let resumeSchedule: (() => void) | undefined
  let stopSchedule: (() => void) | undefined
  let stopSettings: (() => void) | undefined
  let stopped = false
  let guideWrites = Promise.resolve()
  const dispose = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    stopSettings?.()
    stopSchedule?.()
    if (providerUpdateTimer !== undefined) clearInterval(providerUpdateTimer)
    if (channelUpdateTimer !== undefined) clearInterval(channelUpdateTimer)
    stopSpeech?.()
    stopCorrecting()
    shares.stopAll()
    await channels?.dispose()
    manager?.dispose()
    sessions?.dispose()
    routes.forwards.dispose()
    shortcutRuns?.dispose()
    routes.hosts.dispose()
    await Promise.all([routes.runs.flush(), guideWrites, stopFindModelDownload(), stopCamoufoxPreparation()])
  }
  try {
    setGuideEmployees(employees.list().employees)
    sessions = await createCoreSessions(routes, {
      notes,
      validateEmployee: (id) => { employees.active(id) },
      lineup: (now) => { lineup = now; events.emit('lineup:changed', now) },
      ...(process.platform === 'darwin' ? { terminal: (root: string, run: string, status?: string) => {
        const line = isRemote(root) ? hostTerminal(routes, root, run) : run
        if (line !== undefined) events.emit('core:terminal', isRemote(root) ? homedir() : root, line, status)
        else if (status !== undefined) void writeFile(status, '1').catch(() => undefined)
      } } : {}),
      changed: (changed) => {
        all = changed
        for (const conversation of changed) registerProjectBrowserConversation(conversation, getSettings().projects)
        manager?.observeSessions(changed)
        shortcutRuns?.changed()
        events.emit('chat:sessions', changed)
        const settings = getSettings()
        const progressOrder = keptOrder(settings.progressOrder, changed)
        if (progressOrder !== undefined) setSettings({ progressOrder })
      },
      listStatus: (status) => events.emit('chat:listStatus', status),
      items: (items) => { if (!sessions?.isManager(items.id)) events.emit('chat:items', items) },
      account: (account) => events.emit('chat:accountChanged', account),
      show: (id) => { if (!sessions?.isManager(id)) events.emit('chat:show', id) },
      plan: (plan) => events.emit('chat:plan', plan),
      notify: (notice) => {
        if (sessions?.isManager(notice.session)) return
        events.emit('chat:notice', notice)
      },
    })
    const started = sessions
    const syncInstructions = async (instructions: string): Promise<void> => { setGuideManager(instructions); await syncEmployeeGuides(getSettings()) }
    const attachments = new ChannelAttachments(directory)
    const sources = new Map<string, VoiceMemosSource>()
    const registry = await installedChannels()
    const coordinator: Manager = new Manager({ directory, restoreRecord: (record) => restoreChannelManager(record, registry.loaded), threadAllowed: (thread) => channels?.allowed(thread) ?? coordinator.threadRecord(thread)?.shared !== true, syncInstructions, attachments, intake: {
      pairing: () => channels?.pairing(),
      adapters: () => (view.config.intake ?? DEFAULT_MANAGER_INTAKE).sources.filter((source) => source.enabled).map((source) => { const key = JSON.stringify(source); let adapter = sources.get(key); if (adapter === undefined) { adapter = new VoiceMemosSource(source, { transcribe: transcribeInstalledFile, transcription: () => localTranscriptionReadiness({ cli: whisperCli(), model: installedSpeechModel() }) }); sources.set(key, adapter) }; return adapter }),
      classify: (text) => classifyIntake(text, { config: () => view.config, settings: getSettings, check: () => checkVpnIp(getSettings), correct }),
    }, target: (host, args, authorized) => { if (cliTargets === undefined) throw new Error('Host targeting is unavailable. No command ran locally.'); return cliTargets.run(host, args, authorized) }, product: (args) => { if (cliTargets === undefined) throw new Error('Product CLI is unavailable in this host runtime.'); return cliTargets.local(args) }, computers: () => cliTargets?.list() ?? [], providerSettings: (args) => providerSettings(args, { read: getSettings, save: setSettings, inUse: (provider) => started.providerInUse(provider), manager: () => view.config }), employees, channelFile: (thread) => { if (channels === undefined) throw new Error('Channels are not ready yet.'); return channels.fileSender(thread) }, ownerThread: (thread) => channels?.owner(thread) === true, fileLimit: (thread) => channels?.fileLimit(thread), sessions: started, notes, settings: getSettings, saveSettings: setSettings, cli: (args, context) => runManagerCli(process.execPath, cliScript, args, context) })
    manager = coordinator
    if (coordinator.instructions().trim() !== '') void syncInstructions(coordinator.instructions()).catch((error: Error) => { console.warn('Could not write Manager instructions', error) })
    let view: ManagerView = await coordinator.view()
    coordinator.on((changed) => {
      view = changed
      events.emit('manager:view', changed)
    })
    coordinator.onItems((items) => events.emit('manager:items', items))
    // Manager is always on and starts work by itself; an assistant that cannot run it yet leaves it off until one can.
    if (!view.config.enabled || view.config.delegation !== 'automatic') void coordinator.configure({ enabled: true, delegation: 'automatic' }).catch((error: Error) => { console.warn('Could not turn Manager on', error.message) })
    const vault = options.vault ?? { available: () => false, encrypt: () => { throw new Error('Secure storage is unavailable.') }, decrypt: () => { throw new Error('Secure storage is unavailable.') } }
    const hub = new Channels({
      registry,
      directory,
      attachments,
      vault,
      shares,
      review: (session) => coordinator.manages(session) && started.pendingForManager(session).length === 0,
      renameNoteKey: (from, to) => {
        const all = notes.all() as Readonly<Record<string, Readonly<Record<string, unknown>>>>
        if (!Object.values(all).some((note) => from in note)) return
        notes.replace(Object.fromEntries(Object.entries(all).map(([id, { [from]: value, ...note }]) => [id, value === undefined || to in note ? note : { ...note, [to]: value }])) as ReturnType<typeof notes.all>)
      },
      viewed: (view) => events.emit('channels:shown', view),
      settings: getSettings,
      save: setSettings,
      sessions: started,
      conversations: () => all,
      labelConversation: (id, labels) => {
        const note = notes.all()[id] ?? {}
        const merged: { [key: string]: string } = { ...note.labels }
        for (const [key, value] of Object.entries(labels)) { if (value === '') delete merged[key]; else merged[key] = value }
        notes.set(id, { ...note, labels: merged })
      },
      manager: coordinator,
      managerView: () => view,
      employees: () => employees.list().employees,
      projectName: (root) => projectSaid(root, hostNamed),
      subscribe: events.subscribe,
      changed: (changed) => events.emit('channels:changed', changed),
    })
    channels = hub
    const runs = new ShortcutRuns({ directory, onRun: (run) => events.emit('shortcuts:runChanged', run), items: (id) => started.items(id), manager: coordinator, conversations: () => all, publish: (destination, input) => hub.publishShortcut(destination, input) })
    shortcutRuns = runs

    setGuideManager(coordinator.instructions())
    keepBrowserBridge(getSettings().chromeBridge)
    await started.setAllInstructions(getSettings()).catch((error: Error) => { console.warn('Could not set provider instructions:', error.message) })
    plans = new Plans({ sessions: () => started, routes: () => routes, projects: () => getSettings().projects, changed: (places) => events.emit('chat:plans', places) })
    stopSpeech = onSpeechModel((model) => events.emit('speech:model', model))
    const guideKey = (): string => { const settings = getSettings(); return JSON.stringify([settings.chromeBridge, settings.guideClaude, settings.guideCodex, settings.guidePlugins, settings.browserNames, settings.providerPlugins.map((one) => one.id)]) }
    let guided = guideKey()
    stopSettings = onSettings((settings) => {
      events.emit('settings:changed', settings)
      const guide = guideKey()
      if (guide !== guided) {
        guided = guide
        if (settings.chromeBridge !== browserBridgeOn()) keepBrowserBridge(settings.chromeBridge)
        guideWrites = guideWrites.then(() => started.setAllInstructions(settings)).catch((error: Error) => { console.error('Could not set provider instructions:', error.message) })
      }
      void hub.reconcile().catch((error: Error) => console.error('Could not update channels:', error.message))
      started.again()
    })
    let active = false
    const start = async (): Promise<void> => {
      if (active || stopped) return
      active = true
      sweepRecordings()
      providerUpdateTimer = setInterval(() => { if (getSettings().providerAutoUpdate) void checkProviderUpdates().catch(() => undefined) }, 24 * 60 * 60_000)
      if (getSettings().providerAutoUpdate) void checkProviderUpdates().catch(() => undefined)
      providerUpdateTimer.unref?.()
      channelUpdateTimer = setInterval(() => { if (getSettings().channelAutoUpdate) void hub.checkUpdates().catch(() => undefined) }, 24 * 60 * 60_000)
      channelUpdateTimer.unref?.()
      void hub.start().then(() => { if (getSettings().channelAutoUpdate) return hub.checkUpdates() }).catch((error: Error) => console.error('Could not start channels:', error.message))
      stopSchedule = startShortcuts({
        runs,
        manager: (shortcut, request) => coordinator.runShortcut(shortcut, request),
        start: (message) => started.send(message),
        rename: (id, title) => started.rename(id, title),
        busy: (id) => started.busy(id),
        employee: (id) => employees.list().employees.find((one) => one.id === id),
        notice: (title, body) => events.emit('chat:notice', { session: '', title, subtitle: '', body, asks: false }),
      }, (look) => { resumeSchedule = look; return () => { resumeSchedule = undefined } })
      await started.resumeQueues()
      runs.changed()
      const running = Object.entries(routes.runs.all()).map(([id, run]) => ({ id, root: run.root }))
      const hosts = [...new Set(running.map((run) => hostOf(run.root)).filter((id) => id !== undefined))]
      void Promise.allSettled(hosts.map((id) => routes.hosts.ensure(id))).then(() => stopped ? undefined : started.reattach(running)).catch((error: Error) => console.error(error.message))
    }
    const configureManager = (change: Partial<ManagerConfig>): Promise<ManagerView> => coordinator.configure(change)
    return { shortcutRuns: runs, cliRegistry: (args: readonly string[]): string => { if (cliTargets === undefined) throw new Error('Computer registry is unavailable on this runtime.'); return cliTargets.registry(args) }, setCliTargets: (targets: NonNullable<typeof cliTargets>) => { cliTargets = targets }, sessions: started, manager: coordinator, channels: hub, shares, plans, employees, routes, notes, hostNamed, start, dispose, wake: () => { resumeSchedule?.(); started.again() }, configureManager, checkProviderUpdates, subscribe: events.subscribe, emit: events.emit, managerView: () => view, refreshManager: async () => { view = await coordinator.view(); events.emit('manager:view', view) }, current: () => ({ sessions: all, lineup, settings: getSettings(), employees: employees.list(), hosts: routes.hosts.views(), prompts: routes.hosts.prompts(), channels: hub.views(), channelPhoneViews: hub.views('phone'), shares: shares.rooms(), working: started.working(), wanting: started.wanting(), watched: started.watched() }) }
  } catch (error) {
    await dispose()
    throw error
  }
}

export type CoreRuntime = Awaited<ReturnType<typeof createRuntime>>
