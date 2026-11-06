import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import type { Answered, ConversationContinuation, CorrectRequest, Recording, SessionMessage, Settings, ShortcutDraft, TranscribeRequest } from '../shared/api'
import { assistantsIn, providerOf, shownProjects, resumeCommand } from '../shared/api'
import type { EmployeeDraft } from '../shared/employees'
import type { HostAnswer, HostDraft } from '../shared/hosts'
import { hostOf, isRemote, machineName } from '../shared/hosts'
import type { LocalAsk } from '../shared/local'
import type { ManagerConfig } from '../shared/manager'
import type { TelegramAction } from '../shared/telegram'
import type { ChannelChange, ChannelId } from '../shared/channels'
import { recordedNote } from '../shared/recording'
import { commandsFor } from '../main/commands'
import { continueConversation, prepareConversation, writeConversationExport } from '../main/conversation-export'
import { correct } from '../main/correct'
import { fileShown } from '../main/file-shown'
import { isThere } from '../main/file-at'
import { projectFiles } from '../main/files'
import { foldersIn } from '../main/folders'
import { fetchGit, gitRepo, gitState } from '../main/git'
import { hostExists, hostFile, hostFiles, hostGit, hostRepo, hostResumeLine, hostTerminal, hostUpload } from '../main/hosts/route'
import { localPort, withPort } from '../main/hosts/forward'
import { keepToken, pushTo } from '../main/push'
import type { SessionNotice } from '../shared/api'
import { localFetch } from '../main/local-page'
import { browserBridgeOn, browserBridgeState, openTest, stopTest } from '../cli/browser'
import { deleteTestProfile } from '../cli/testing'
import { deleteFindModel, fetchFindModel, findModelServer } from '../cli/find-model'
import { localTranscriptionReadiness } from '../main/local-transcription'
import { askOrders, carryOut, saying } from '../main/orders'
import type { Order, Told } from '../main/orders'
import { keepRecording, startRecording, addToRecording, dropRecording } from '../main/recordings'
import { removeShortcut, runShortcut, saveShortcut } from '../main/shortcuts'
import { forgetProject, getSettings, rememberProject, setSettings } from '../main/store'
import type { Sessions } from '../main/sessions'
import { configureManagerAccess, phoneTelegramView, telegramActionAccess } from '../main/telegram-access'
import { transcribe } from '../main/transcribe'
import { voiceMemosConnection } from '../main/voice-memos'
import { checkVpnIp } from '../main/vpn-ip'
import { fetchSpeechModel, installedSpeechModel, speechModel, whisperCli } from '../main/whisper'
import { applyReadyPlugin, installPlugin, providerPluginFailures, reinstallFailedPlugin, uninstallPlugin } from '../main/sessions/plugins'
import { instructionsFor, registerProviderInfo } from '../shared/providers'
import type { SessionProvider } from '../shared/api'
import type { CoreRuntime } from './runtime'
import { dataDirectory } from './platform'

export function application(runtime: CoreRuntime) {
  const { sessions, employees, manager, telegram, routes, shares, channels } = runtime
  let cutOffered = false
  let planned: { readonly orders: readonly Order[]; readonly told: readonly Told[]; readonly recording?: Recording } | undefined
  const unfavorite = (ids: readonly string[]): void => {
    const favorites = getSettings().favorites
    if (favorites.some((id) => ids.includes(id))) setSettings({ favorites: favorites.filter((id) => !ids.includes(id)) })
  }
  const remove = async (ids: readonly string[]) => { const gone = await sessions.remove(ids); unfavorite(gone); return gone }
  const list = (root: string | undefined, every: readonly string[]) => {
    const where = typeof root === 'string' && root !== '' ? root : undefined
    if (where !== undefined) rememberProject(where)
    return sessions.list(where === undefined ? every : [where])
  }
  const search = async (asked: string, root: string | undefined, every: readonly string[]) => {
    const roots = typeof root === 'string' && root !== '' ? [root] : every
    const found = await sessions.search(roots, asked)
    return [...sessions.queuedHolding(roots, asked).filter((hit) => !found.some((one) => one.id === hit.id)), ...found].filter((one) => assistantsIn(getSettings()).includes(providerOf(one.id)))
  }
  const transfer = (request: ConversationContinuation, copy = false) => {
    const deps = { directory: join(dataDirectory(), 'conversation-exports'), settings: getSettings, snapshot: (id: string) => sessions.snapshot(id), send: (message: SessionMessage) => sessions.send(message), upload: (root: string, path: string) => hostUpload(routes, root, path) }
    return copy ? prepareConversation(request, deps).then((message) => sessions.prepare(message)) : continueConversation(request, deps)
  }
  const forwardLink = async (root: string, href: string) => {
    const id = hostOf(root)
    const port = localPort(href)
    if (id === undefined || port === undefined) return { href }
    const local = await routes.forwards.open(id, port)
    const name = routes.hosts.config(id)?.name ?? id
    if (local === undefined) return { href, problem: `Could not bring ${name}'s ${String(port)} here. Check that ${name} is connected, then open the link again.` }
    return { href: withPort(href, local), ...(local === port ? {} : { moved: `${name}'s ${String(port)} is at ${String(local)} on ${machineName(hostname())}` }) }
  }
  const readOrders = async (said: string, recording?: Recording): Promise<Answered> => {
    planned = undefined
    const projects = getSettings().projects
    const told: Told[] = (await sessions.list(projects)).map(({ id, title, root, state }) => ({ id, title, root, state }))
    try { await checkVpnIp(getSettings) } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
    const read = await askOrders(said, projects, told, undefined, runtime.hostNamed)
    if (read.error !== undefined) return { ok: false, error: read.error }
    const { orders, lines } = saying(read.orders, projects, told, runtime.hostNamed)
    if (orders.length === 0) return { ok: false, error: `Nothing to do in "${said}"` }
    planned = { orders, told, ...(recording === undefined ? {} : { recording }) }
    return { ok: true, plan: lines, heard: said }
  }
  const executeOrders = async (): Promise<Answered & { readonly open?: string }> => {
    const plan = planned
    planned = undefined
    if (plan === undefined) return { ok: false, error: 'There is nothing waiting to be done' }
    const mode = getSettings().chatMode
    let opened: string | undefined
    const did = await carryOut(plan.orders, getSettings().projects, plan.told, {
      start: async (root, text, goal) => {
        const recording = plan.recording
        if (recording !== undefined) keepRecording()
        const note = recording === undefined ? undefined : recordedNote(recording.seconds, recording.frames, recording.video, isRemote(root))
        const id = await sessions.send({ root, mode, text: note === undefined ? text : `${text}\n\n${note}`, ...(recording === undefined ? {} : { images: recording.frames.map((frame) => frame.image) }) })
        if (goal !== undefined) await sessions.send({ session: id, root, mode, text: `/goal ${goal}` })
        return id
      },
      say: async (id, text) => { const chat = plan.told.find((one) => one.id === id); if (chat !== undefined) await sessions.send({ session: id, root: chat.root, mode, text }) },
      stop: (id) => sessions.stop(id), mark: (id, status) => sessions.mark(id, status),
      open: (id) => { opened = id; runtime.emit('chat:show', id) }, delete: async (id) => { await remove([id]) },
    }, runtime.hostNamed)
    return did.length === 0 ? { ok: false, error: 'None of that could be done' } : { ok: true, text: did.join('\n'), ...(opened === undefined ? {} : { open: opened }) }
  }
  return {
    'service:bootstrap': async () => {
      await sessions.refresh(getSettings().projects)
      return { ...runtime.current(), manager: await manager.view(), speech: speechModel(), home: homedir(), platform: process.platform, name: machineName(hostname()) }
    },
    'core:state': () => runtime.current(),
    'core:resume': () => runtime.wake(),
    'settings:get': () => getSettings(),
    'settings:set': (change: Partial<Settings>) => setSettings(change.analytics === false ? { ...change, client: '' } : change),
    'phone:settings': () => ({ ...getSettings(), profile: '', chatProjects: [], chatAll: true }),
    'phone:list': (root: string | undefined) => list(root, getSettings().projects),
    'phone:search': (asked: string, root: string | undefined) => search(asked, root, getSettings().projects),
    'phone:telegram': () => phoneTelegramView(telegram.view()),
    'phone:telegramAction': (action: TelegramAction) => telegramActionAccess(manager, telegram, action, false),
    'employees:list': () => employees.list(),
    'employees:save': (draft: EmployeeDraft) => employees.save(draft),
    'employees:archive': (id: string, revision: number) => employees.archive(id, revision),
    'employees:restore': (id: string, revision: number) => employees.archive(id, revision, false),
    'employees:retryInstructions': () => employees.retryInstructions(),
    'employees:memory': (id: string, cursor?: string) => employees.memory(id, cursor),
    'manager:view': () => manager.view(),
    'manager:configure': (change: Partial<ManagerConfig>) => configureManagerAccess(manager, telegram, change),
    'manager:history': (...args: Parameters<typeof manager.history>) => manager.history(...args),
    'manager:inspect': (...args: Parameters<typeof manager.inspect>) => manager.inspect(...args),
    'manager:sendApp': (request: Parameters<typeof manager.sendApp>[0]) => manager.sendApp(request, 'desktop'),
    'manager:sendAppPhone': (request: Parameters<typeof manager.sendApp>[0]) => manager.sendApp(request, 'phone'),
    'manager:receipt': (...args: Parameters<typeof manager.receipt>) => manager.receipt(...args),
    'manager:answerApp': (...args: Parameters<typeof manager.answerApp>) => manager.answerApp(...args),
    'manager:answerCard': (...args: Parameters<typeof manager.answerCard>) => manager.answerCard(...args),
    'manager:voice-memos': () => voiceMemosConnection({ transcription: () => localTranscriptionReadiness({ cli: whisperCli(), model: installedSpeechModel() }) }, manager.voiceMemosDirectory()),
    'telegram:view': () => telegram.view(),
    'channels:view': () => channels.view(),
    'channels:install': (url: string) => channels.install(url),
    'channels:configure': (id: ChannelId, change: ChannelChange) => channels.configure(id, change),
    'channels:remove': (id: ChannelId) => channels.remove(id),
    'channels:checkUpdates': () => channels.checkUpdates(),
    'telegram:action': (action: TelegramAction) => telegramActionAccess(manager, telegram, action, true),
    'correct': (request: CorrectRequest) => correct(request),
    'transcribe': (request: TranscribeRequest) => transcribe(request),
    'speech:model': () => speechModel(),
    'speech:fetch': () => fetchSpeechModel(),
    'browser:state': () => browserBridgeState(),
    'browser:fetchModel': () => { if (browserBridgeOn() && findModelServer()) void fetchFindModel() },
    'browser:deleteModel': async () => { if (!browserBridgeOn()) await deleteFindModel() },
    'browser:openTest': async (name: string) => { if (browserBridgeOn()) await openTest(name) },
    'browser:deleteTest': async (name: string) => { const stopped = await stopTest(name); if (!stopped.ok) throw new Error(stopped.said); deleteTestProfile(name) },
    'voice:video': () => startRecording(),
    'recording:start': (ext: string) => startRecording(ext),
    'recording:part': (part: string) => addToRecording(Buffer.from(part, 'base64')),
    'recording:keep': () => keepRecording(),
    'recording:drop': () => dropRecording(),
    'push:token': (token: string) => keepToken(getSettings().phoneKey, token),
    'push:send': (notice: SessionNotice) => pushTo(getSettings().phoneKey, notice),
    'voice:videoPart': (part: Uint8Array) => addToRecording(part),
    'voice:keepRecording': () => keepRecording(),
    'voice:dropRecording': () => dropRecording(),
    'orders:read': (said: string) => readOrders(said),
    'orders:recorded': async (recording: Recording): Promise<Answered> => {
      const read = await readOrders(`Start this as one task, in the project it is about:\n${recording.text}`, recording)
      const at = planned?.orders.findIndex((one) => one.do === 'start') ?? -1
      const start = planned?.orders[at]
      const line = read.plan?.[at]
      if (planned === undefined || start === undefined || line === undefined) { planned = undefined; return { ok: false, error: 'No folder fits what was said. Name the folder and try again.' } }
      planned = { orders: [start], told: planned.told, recording }
      return { ok: true, plan: [line], heard: recording.text }
    },
    'voice:ask': async (recording: Recording): Promise<Answered> => {
      const id = await sessions.send({ root: '', mode: getSettings().chatMode, text: `${recording.text}\n\n${recordedNote(recording.seconds, recording.frames, recording.video)}`, images: recording.frames.map((frame) => frame.image), question: true })
      keepRecording()
      runtime.emit('chat:show', id)
      return { ok: true }
    },
    'orders:do': () => executeOrders(),
    'orders:cancel': () => { planned = undefined },
    'shortcuts:save': (draft: ShortcutDraft) => saveShortcut(draft),
    'shortcuts:remove': (id: string) => removeShortcut(id),
    'shortcuts:run': (id: string) => runShortcut(id, 'hand'),
    'chat:list': (root: string | undefined) => list(root, shownProjects(getSettings())),
    'chat:search': (asked: string, root: string | undefined) => search(asked, root, shownProjects(getSettings())),
    'chat:hidden': (older: boolean) => sessions.hidden(getSettings().projects, older),
    'chat:forgetProject': (root: string) => forgetProject(root),
    'chat:rememberProject': (root: string) => rememberProject(root),
    'chat:delete': (ids: readonly string[]) => remove(ids),
    'chat:hide': (id: string) => { sessions.hide(id); unfavorite([id]) },
    'chat:exportConversation': async (id: string) => writeConversationExport(await sessions.snapshot(id), join(dataDirectory(), 'conversation-exports')),
    'chat:continueConversation': (request: ConversationContinuation) => transfer(request),
    'chat:copyConversation': (request: ConversationContinuation) => transfer(request, true),
    'chat:waiting': async (id: string) => (await sessions.items(id)).findLast((item) => item.kind === 'card' && item.card.answered === undefined),
    'chat:cutOff': () => { if (cutOffered) return []; cutOffered = true; return sessions.cutOff().filter((one) => routes.runs.get(one.id) === undefined) },
    'chat:proceed': (ids: readonly string[]) => { for (const id of ids) void sessions.proceed(id) },
    'lineup:state': () => runtime.current().lineup,
    'chat:terminalCommand': (id: string, root: string) => { const line = resumeCommand(id); if (line === undefined) return undefined; sessions.handOver(id); return { root: isRemote(root) ? homedir() : root, line: isRemote(root) ? hostTerminal(routes, root, line) : line } },
    'hosts:terminalCommand': (id: string, run: string | undefined) => routes.hosts.terminalCommand(id, undefined, run),
    'chat:plan': () => { void sessions.measure(); return sessions.plan() },
    'chat:plans': () => runtime.plans.asked(),
    'chat:git': async (root: string) => { if (isRemote(root)) return hostGit(routes, root); const state = await gitState(root); if (state?.upstream !== undefined) void fetchGit(root).then(async (done) => { if (done) runtime.emit('chat:git', { root, state: await gitState(root) }) }); return state },
    'chat:upload': (root: string, path: string) => isRemote(root) ? hostUpload(routes, root, path) : { path },
    'chat:exists': (root: string, path: string) => isRemote(root) ? hostExists(routes, root, path) : isThere(root, path),
    'chat:file': (root: string, path: string) => isRemote(root) ? hostFile(routes, root, path) : fileShown(root, path),
    'chat:repo': (root: string) => isRemote(root) ? hostRepo(routes, root) : gitRepo(root),
    'chat:files': (root: string) => isRemote(root) ? hostFiles(routes, root) : projectFiles(root),
    'chat:commands': (root: string) => commandsFor(root),
    'chat:folders': (path: string | undefined) => foldersIn(path),
    'chat:firstAsked': async (id: string) => { const first = (await sessions.items(id)).find((item) => item.kind === 'mine'); return first?.kind === 'mine' ? first.text : '' },
    'local:fetch': (asked: LocalAsk) => localFetch(asked),
    'share:rooms': () => shares.rooms(),
    'share:about': (id: string) => shares.about(id),
    'share:fetch': (id: string, asked: LocalAsk) => shares.fetch(id, asked),
    'share:read': (id: string, path: string) => shares.read(id, path),
    'hosts:list': () => routes.hosts.views(),
    'hosts:known': () => routes.hosts.known(),
    'hosts:check': (draft: HostDraft) => routes.hosts.check(draft),
    'hosts:update': (id: string, draft: HostDraft) => routes.hosts.update(id, draft),
    'hosts:remove': (id: string) => { routes.forwards.closeHost(id); return routes.hosts.remove(id) },
    'hosts:forget': (id: string) => routes.hosts.forget(id),
    'hosts:connect': (id: string) => routes.hosts.connect(id),
    'hosts:reconnect': (id: string) => routes.hosts.reconnect(id),
    'hosts:disconnect': (id: string) => { routes.forwards.closeHost(id); routes.hosts.disconnect(id) },
    'hosts:folders': (id: string, path: string | undefined) => routes.hosts.folders(id, path),
    'hosts:addFolder': (id: string, path: string) => routes.hosts.addFolder(id, path),
    'hosts:addFolderSaying': (id: string, path: string) => routes.hosts.addFolderSaying(id, path),
    'hosts:prompts': () => routes.hosts.prompts(),
    'hosts:answer': (answer: HostAnswer) => routes.hosts.answer(answer),
    'hosts:install': (id: string) => routes.hosts.install(id),
    'hosts:trustNewKey': (id: string) => routes.hosts.trustNewKey(id),
    'hosts:running': (id: string) => routes.hosts.running(id),
    'hosts:working': (id: string) => sessions.ids((root) => hostOf(root) === id).filter((one) => sessions.busy(one)).length,
    'hosts:conversations': (id: string) => sessions.ids((root) => hostOf(root) === id).length,
    'hosts:terminal': (id: string, run: string | undefined) => { const line = routes.hosts.terminalCommand(id, undefined, run); if (line !== undefined) runtime.emit('core:terminal', homedir(), line) },
    'hosts:resumeLine': (root: string, id: string) => hostResumeLine(routes, root, id),
    'hosts:forwardLink': (root: string, href: string) => forwardLink(root, href),
    'chat:account': (...args: Parameters<Sessions['account']>) => sessions.account(...args),
    'chat:models': (...args: Parameters<Sessions['models']>) => sessions.models(...args),
    'chat:bring': (...args: Parameters<Sessions['bring']>) => sessions.bring(...args),
    'chat:items': (...args: Parameters<Sessions['items']>) => sessions.items(...args),
    'chat:schedule': (...args: Parameters<Sessions['schedule']>) => sessions.schedule(...args),
    'chat:preparedDraft': (...args: Parameters<Sessions['preparedDraft']>) => sessions.preparedDraft(...args),
    'chat:savePreparedDraft': (...args: Parameters<Sessions['savePreparedDraft']>) => sessions.savePreparedDraft(...args),
    'chat:links': (...args: Parameters<Sessions['links']>) => sessions.links(...args),
    'chat:retry': (...args: Parameters<Sessions['retry']>) => sessions.retry(...args),
    'chat:send': (message: SessionMessage) => sessions.send(message),
    'chat:answer': (...args: Parameters<Sessions['answer']>) => sessions.answer(...args),
    'chat:answerRequest': (...args: Parameters<Sessions['answerRequest']>) => sessions.answerRequest(...args),
    'chat:startAll': (...args: Parameters<Sessions['startAll']>) => sessions.startAll(...args),
    'chat:answerTeamRequest': (...args: Parameters<Sessions['answerTeamRequest']>) => sessions.answerTeamRequest(...args),
    'chat:stop': (...args: Parameters<Sessions['stop']>) => sessions.stop(...args),
    'chat:unqueue': (...args: Parameters<Sessions['unqueue']>) => sessions.unqueue(...args),
    'chat:injectQueued': (id: string, queued: string) => sessions.injectQueued(id, queued),
    'chat:queuedPicture': (...args: Parameters<Sessions['queuedPicture']>) => sessions.queuedPicture(...args),
    'chat:requeue': (...args: Parameters<Sessions['requeue']>) => sessions.requeue(...args),
    'chat:reorderQueued': (...args: Parameters<Sessions['reorderQueued']>) => sessions.reorderQueued(...args),
    'chat:delegate': (id: string, queued: string, history: boolean) => sessions.delegate(id, queued, history),
    'chat:mode': (...args: Parameters<Sessions['mode']>) => sessions.mode(...args),
    'chat:transport': (...args: Parameters<Sessions['transport']>) => sessions.transport(...args),
    'chat:rename': (...args: Parameters<Sessions['rename']>) => sessions.rename(...args),
    'chat:mark': (id: string, status: Parameters<Sessions['mark']>[1]) => sessions.mark(id, status, { executor: 'user', origin: 'desktop' }),
    'chat:markPhone': (id: string, status: Parameters<Sessions['mark']>[1]) => sessions.mark(id, status, { executor: 'user', origin: 'phone' }),
    'chat:keep': (...args: Parameters<Sessions['keep']>) => sessions.keep(...args),
    'chat:watching': (...args: Parameters<Sessions['watching']>) => sessions.watching(...args),
    'chat:read': (...args: Parameters<Sessions['read']>) => sessions.read(...args),
    'chat:remote': (...args: Parameters<Sessions['remote']>) => sessions.remote(...args),
    'chat:mcp': (...args: Parameters<Sessions['mcp']>) => sessions.mcp(...args),
    'chat:browsers': (...args: Parameters<Sessions['browsers']>) => sessions.browsers(...args),
    'chat:handOver': (...args: Parameters<Sessions['handOver']>) => sessions.handOver(...args),
    'chat:shell': (...args: Parameters<Sessions['shell']>) => sessions.shell(...args),
    'chat:stopShell': (...args: Parameters<Sessions['stopShell']>) => sessions.stopShell(...args),
    'chat:typeShell': (...args: Parameters<Sessions['typeShell']>) => sessions.typeShell(...args),
    'chat:toBackground': (...args: Parameters<Sessions['toBackground']>) => sessions.toBackground(...args),
    'chat:stopTask': (...args: Parameters<Sessions['stopTask']>) => sessions.stopTask(...args),
    'chat:clearTask': (...args: Parameters<Sessions['clearTask']>) => sessions.clearTask(...args),
    'chat:taskOutput': (...args: Parameters<Sessions['taskOutput']>) => sessions.taskOutput(...args),
    'chat:assignEmployee': (...args: Parameters<Sessions['assignEmployee']>) => sessions.assignEmployee(...args),
    'chat:snapshot': (...args: Parameters<Sessions['snapshot']>) => sessions.snapshot(...args),
    'chat:prepare': (...args: Parameters<Sessions['prepare']>) => sessions.prepare(...args),
    'manager:pause': (...args: Parameters<typeof manager.pause>) => manager.pause(...args),
    'manager:resume': (...args: Parameters<typeof manager.resume>) => manager.resume(...args),
    'manager:retry': (...args: Parameters<typeof manager.retry>) => manager.retry(...args),
    'manager:restart': (...args: Parameters<typeof manager.restart>) => manager.restart(...args),
    'manager:send': (text: string) => manager.send(text),
    'manager:answer': (id: string, choice: string) => manager.answer(id, choice),
    'chat:installProvider': async (url: string) => {
    const installed = await installPlugin(url)
    sessions.addProvider(installed.provider)
    const enabled = assistantsIn(getSettings())
    setSettings({ providerPlugins: [...getSettings().providerPlugins, installed.info], chatProviders: enabled.includes(installed.provider.family) ? enabled : [...enabled, installed.provider.family] })
    registerProviderInfo(getSettings().providerPlugins)
    void sessions.refresh(getSettings().projects)
    return installed.info
    },
    'chat:reinstallProvider': async (id: string) => {
    const reinstalled = await reinstallFailedPlugin(id)
    sessions.addProvider(reinstalled.provider)
    const previous = getSettings()
    const enabled = assistantsIn(previous)
    const providerPlugins = [...previous.providerPlugins.filter((one) => one.id !== reinstalled.info.id), reinstalled.info]
    setSettings({ providerPlugins, providerUpdatesReady: previous.providerUpdatesReady.filter((one) => one !== reinstalled.info.id), chatProviders: enabled.includes(reinstalled.info.family) ? enabled : [...enabled, reinstalled.info.family] })
    registerProviderInfo(providerPlugins)
    void sessions.refresh(getSettings().projects)
    return reinstalled.info
    },
    'chat:uninstallProvider': async (id: string) => {
    const previous = getSettings()
    const provider = previous.providerPlugins.find((one) => one.id === id)
    if (provider === undefined) {
      if (!providerPluginFailures().some((one) => one.id === id)) throw new Error('Library is not installed.')
      await uninstallPlugin(id)
      setSettings({ providerRemovalPending: true })
      return
    }
    const ownInstructions = instructionsFor(provider) === 'own' && previous.guidePlugins[id] !== false
    if (ownInstructions) await sessions.setInstructions(provider.family, false, previous.browserNames)
    try { await uninstallPlugin(id) }
    catch (error) {
      if (ownInstructions) void sessions.setInstructions(provider.family, true, previous.browserNames)
      throw error
    }
    const providerPlugins = previous.providerPlugins.filter((one) => one.id !== id)
    const enabled = assistantsIn(previous).filter((one) => one !== provider.family)
    const fallback: SessionProvider = provider.runtime === 'codex' ? 'codex' : 'claude'
    const chatProviders: readonly SessionProvider[] = enabled.length > 0 ? enabled : [fallback]
    const chatProvider: SessionProvider = chatProviders.includes(previous.chatProvider) ? previous.chatProvider : chatProviders[0] ?? fallback
    setSettings({
      providerPlugins,
      providerUpdatesReady: previous.providerUpdatesReady.filter((one) => one !== id),
      providerRemovalPending: true,
      chatProviders,
      chatProvider,
      correctProvider: previous.correctProvider === provider.family ? chatProvider : previous.correctProvider,
    })
    registerProviderInfo(providerPlugins)
    void sessions.refresh(getSettings().projects)
    },
    'chat:applyProviderUpdate': async (id: string) => {
    const previous = getSettings()
    if (!previous.providerUpdatesReady.includes(id)) throw new Error('No update is ready for this library. Check for updates and try again.')
    const updated = await applyReadyPlugin(id)
    sessions.replaceProvider(updated.provider)
    const current = getSettings()
    const providerPlugins = current.providerPlugins.map((one) => one.id === id ? updated.info : one)
    setSettings({ providerPlugins, providerUpdatesReady: current.providerUpdatesReady.filter((one) => one !== id) })
    registerProviderInfo(providerPlugins)
    void sessions.refresh(getSettings().projects)
    return updated.info
    },
    'chat:checkProviderUpdates': () => runtime.checkProviderUpdates(),
    'chat:providerPluginFailures': () => providerPluginFailures(),
  }
}

export type CoreMethods = ReturnType<typeof application>
export type ServiceSnapshot = Awaited<ReturnType<CoreMethods['service:bootstrap']>>
