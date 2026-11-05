import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { ChatSession, Lineup } from '../shared/api'
import type { ManagerConfig, ManagerDecision, ManagerView } from '../shared/manager'
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
import { TelegramAttachments } from '../main/telegram-attachments'
import { ManagerTelegram } from '../main/telegram'
import { threadActivity } from '../main/manager-status'
import type { TelegramVault } from '../main/telegram'
import { Shares } from '../main/shares'
import { managerTelegramStatus } from '../main/telegram-text'
import { configureManagerAccess } from '../main/telegram-access'
import type { HostsDeps } from '../main/hosts/hosts'
import { hostTerminal } from '../main/hosts/route'
import { Plans } from '../main/plans'
import { updateInstalledPlugins } from '../main/sessions/plugins'
import type { PluginUpdateResult } from '../shared/providers'
import { coreEvents } from './events'
import { Channels } from '../main/channels/channels'

import { Employees } from '../main/employees'
import { keepBrowserBridge, setGuideEmployees, setGuideManager, syncEmployeeGuides } from '../main/guide'
import { browserBridgeOn } from '../cli/browser'
import { Manager, runManagerCli } from '../main/manager'
import { projectSaid } from '../main/orders'
import { removeShortcut, resumeOwned, runShortcut, saveShortcut, startShortcuts } from '../main/shortcuts'
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
  readonly vault?: TelegramVault
  readonly secrets?: HostsDeps['secrets']
}

export async function createRuntime(cliScript: string, options: RuntimeOptions = {}) {
  const events = coreEvents()
  let all: readonly ChatSession[] = []
  let lineup: Lineup = { working: 0, limit: 0 }
  let telegram: ManagerTelegram | undefined
  let plans: Plans | undefined
  let channels: Channels | undefined
  const hostWasUp = new Map<string, boolean>()
  const shares = new Shares({
    changed: () => { events.emit('peer:shares', shares.rooms()); if (telegram !== undefined) events.emit('telegram:view', telegram.view()) },
    ended: (id) => telegram?.linkEnded(id),
  })
  const directory = dataDirectory()
  const notes = notesStore()
  let sessions: Sessions | undefined
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
      saveShortcut, removeShortcut,
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
    plans?.dispose()
    shares.stopAll()
    telegram?.stop()
    await channels?.dispose()
    manager?.dispose()
    sessions?.dispose()
    routes.forwards.dispose()
    routes.hosts.dispose()
    await Promise.all([routes.runs.flush(), guideWrites, stopFindModelDownload()])
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
        events.emit('chat:sessions', changed)
        const settings = getSettings()
        const progressOrder = keptOrder(settings.progressOrder, changed)
        if (progressOrder !== undefined) setSettings({ progressOrder })
      },
      items: (items) => { if (!sessions?.isManager(items.id)) events.emit('chat:items', items) },
      account: (account) => events.emit('chat:accountChanged', account),
      show: (id) => { if (!sessions?.isManager(id)) events.emit('chat:show', id) },
      plan: (plan) => events.emit('chat:plan', plan),
      notify: (notice) => {
        if (sessions?.isManager(notice.session)) return
        if (notice.asks && manager?.manages(notice.session) === true && sessions?.pendingForManager(notice.session).length === 0) void telegram?.notify(`${notice.title}\n${notice.body}\n\nOpen the worker in GeckIt to review this request.`).catch(() => undefined)
        events.emit('chat:notice', notice)
      },
    })
    const started = sessions
    const syncInstructions = async (instructions: string): Promise<void> => { setGuideManager(instructions); await syncEmployeeGuides(getSettings()) }
    const attachments = new TelegramAttachments(directory)
    const sources = new Map<string, VoiceMemosSource>()
    const coordinator: Manager = new Manager({ directory, syncInstructions, attachments, intake: {
      pairing: () => { const state = telegram?.view(); return state?.state === 'connected' && state.account !== undefined && state.bot !== undefined ? `${String(state.bot.id)}:${String(state.account.id)}:${String(state.account.chatId)}` : undefined },
      adapters: () => (view.config.intake ?? DEFAULT_MANAGER_INTAKE).sources.filter((source) => source.enabled).map((source) => { const key = JSON.stringify(source); let adapter = sources.get(key); if (adapter === undefined) { adapter = new VoiceMemosSource(source, { transcribe: transcribeInstalledFile, transcription: () => localTranscriptionReadiness({ cli: whisperCli(), model: installedSpeechModel() }) }); sources.set(key, adapter) }; return adapter }),
      classify: (text) => classifyIntake(text, { config: () => view.config, settings: getSettings, check: () => checkVpnIp(getSettings), correct }),
    }, employees, telegramFile: () => telegram === undefined ? (() => { throw new Error('Telegram is not ready yet.') })() : telegram.fileSender(), sessions: started, notes, settings: getSettings, saveSettings: setSettings, cli: (args, context) => runManagerCli(process.execPath, cliScript, args, context) })
    manager = coordinator
    if (coordinator.instructions().trim() !== '') void syncInstructions(coordinator.instructions()).catch((error: Error) => { console.warn('Could not write Manager instructions', error) })
    let view: ManagerView = await coordinator.view()
    const decisions = new Map<string, string>()
    let deliveryChannel = ''
    // Telegram talks to Manager in a thread of its own per chat; the paired person still answers GeckIt's own decisions there, as before threads.
    const telegramThread = (): string => {
      const account = telegram?.view().account
      if (account === undefined) throw new Error('Telegram is not connected.')
      return coordinator.thread({ channel: 'telegram', place: 'Telegram', key: String(account.chatId), title: account.name, from: account.name, labels: { chat: String(account.chatId), user: String(account.id), ...(account.username === undefined ? {} : { username: `@${account.username}` }) } })
    }
    const forTelegram = (decision: ManagerDecision): boolean => decision.thread === undefined || coordinator.threadRecord(decision.thread)?.channel === 'telegram'
    const bridge = new ManagerTelegram({
      directory,
      shares,
      attachments,
      vault: options.vault ?? { available: () => false, encrypt: () => { throw new Error('Secure storage is unavailable.') }, decrypt: () => { throw new Error('Secure storage is unavailable.') } },
      manager: {
        pending: () => coordinator.telegramPending(),
        typingAllowed: () => coordinator.telegramTypingAllowed(telegramThread()),
        onPending: (changed) => coordinator.on(() => changed()),
        submit: (text, id, files, authorized) => coordinator.send(text, 'telegram', id, [], authorized, files, [], telegramThread()),
        reply: async (text, id, reference, authorized, files) => { await coordinator.reply(text, id, reference, authorized, files, reference.thread ?? telegramThread()) },
        pause: async () => { await coordinator.pause() },
        resume: async () => { await coordinator.resume() },
        status: () => managerTelegramStatus(view),
        enabled: () => coordinator.enabled(),
        decisions: () => view.decisions.filter(forTelegram),
        hasDecision: (id) => view.decisions.some((item) => item.id === id),
        answer: async (id, choice, authorized) => {
          const decision = view.decisions.find((item) => item.id === id)
          if (decision === undefined || decision.kind === 'native' || decision.choices.some((item) => item.value === choice)) return (await coordinator.answer(id, choice, authorized)).answer
          else await coordinator.send(`Reply to Manager decision ${id} (${decision.title}): ${choice}`, 'telegram')
        },
      },
      changed: (changed) => {
        events.emit('telegram:view', changed)
        const channel = changed.account === undefined || changed.state !== 'connected' ? '' : `${String(changed.bot?.id)}:${String(changed.account.id)}`
        if (channel !== '' && channel !== deliveryChannel) {
          deliveryChannel = channel
          decisions.clear()
          notifyDecisions(view)
        }
        if (changed.state === 'disconnected') deliveryChannel = ''
        coordinator.close('telegram', changed.state === 'connected' && changed.account !== undefined ? undefined : 'Telegram is not connected. Connect it in Settings, Channels to reply in this thread.')
      },
    })
    telegram = bridge
    const notifyDecisions = (changed: ManagerView): void => {
      if (bridge.view().account === undefined) return
      for (const id of decisions.keys()) if (!changed.decisions.some((item) => item.id === id && forTelegram(item))) {
        decisions.delete(id)
        try { bridge.resolve(id) } catch { /* Telegram reports its secure-storage failure in its own view. */ }
      }
      for (const decision of changed.decisions.filter(forTelegram)) {
        const signature = JSON.stringify(decision)
        if (decisions.get(decision.id) === signature) continue
        decisions.set(decision.id, signature)
        void bridge.notify(decision.title, decision).catch(() => undefined)
      }
    }
    coordinator.on((changed) => {
      view = changed
      events.emit('manager:view', changed)
      notifyDecisions(changed)
      const chat = bridge.view().account?.chatId
      bridge.progress(chat === undefined ? undefined : threadActivity(changed, `telegram:${String(chat)}`))
    })
    coordinator.onItems((items) => events.emit('manager:items', items))
    const hub = new Channels({
      directory,
      vault: options.vault ?? { available: () => false, encrypt: () => { throw new Error('Secure storage is unavailable.') }, decrypt: () => { throw new Error('Secure storage is unavailable.') } },
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
    coordinator.onResponse((text, origin) => { if (origin.thread !== undefined && coordinator.threadRecord(origin.thread)?.channel === 'telegram') void bridge.notify(text, undefined, origin).catch(() => undefined) })

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
      if (view.config.enabled) void bridge.start()
      else await bridge.action({ kind: 'disconnect' })
      providerUpdateTimer = setInterval(() => { if (getSettings().providerAutoUpdate) void checkProviderUpdates().catch(() => undefined) }, 24 * 60 * 60_000)
      if (getSettings().providerAutoUpdate) void checkProviderUpdates().catch(() => undefined)
      providerUpdateTimer.unref?.()
      channelUpdateTimer = setInterval(() => { if (getSettings().channelAutoUpdate) void hub.checkUpdates().catch(() => undefined) }, 24 * 60 * 60_000)
      channelUpdateTimer.unref?.()
      void hub.start().then(() => { if (getSettings().channelAutoUpdate) return hub.checkUpdates() }).catch((error: Error) => console.error('Could not start channels:', error.message))
      stopSchedule = startShortcuts({
        manager: (shortcut, request) => coordinator.runShortcut(shortcut, request),
        start: (message) => started.send(message),
        rename: (id, title) => started.rename(id, title),
        busy: (id) => started.busy(id),
        employee: (id) => employees.list().employees.find((one) => one.id === id),
      }, (look) => { resumeSchedule = look; return () => { resumeSchedule = undefined } })
      await started.resumeQueues()
      const running = Object.entries(routes.runs.all()).map(([id, run]) => ({ id, root: run.root }))
      const hosts = [...new Set(running.map((run) => hostOf(run.root)).filter((id) => id !== undefined))]
      void Promise.allSettled(hosts.map((id) => routes.hosts.ensure(id))).then(() => stopped ? undefined : started.reattach(running)).catch((error: Error) => console.error(error.message))
    }
    const configureManager = async (change: Partial<ManagerConfig>): Promise<ManagerView> => configureManagerAccess(coordinator, bridge, change)
    return { sessions: started, manager: coordinator, telegram: bridge, channels: hub, shares, plans, employees, routes, notes, hostNamed, start, dispose, wake: () => { resumeSchedule?.(); started.again() }, configureManager, checkProviderUpdates, subscribe: events.subscribe, emit: events.emit, current: () => ({ sessions: all, lineup, settings: getSettings(), employees: employees.list(), hosts: routes.hosts.views(), prompts: routes.hosts.prompts(), telegram: bridge.view(), shares: shares.rooms(), working: started.working(), wanting: started.wanting(), watched: started.watched() }) }
  } catch (error) {
    await dispose()
    throw error
  }
}

export type CoreRuntime = Awaited<ReturnType<typeof createRuntime>>
