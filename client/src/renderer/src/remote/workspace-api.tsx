import { createRoot } from 'react-dom/client'
import type { CoreMethods } from '../../../core/application'
import type { HostView } from '../../../shared/hosts'
import type { Settings, UpdateView } from '../../../shared/api'
import { createRendererApi } from '../../../shared/renderer-api'
import type { RendererArgument, RendererTransport } from '../../../shared/renderer-api'
import type { RemoteServer } from '../../../shared/remote/protocol'
import { clientOwn } from '../../../shared/client-own'
import { phoneErrors } from '../phone-errors'
import { countEvent } from '../../../shared/counting'
import type { EventName } from '../../../shared/counting'
import { LINK_DOWN } from './client'
import type { PhoneCalls } from '../phone-calls'
import type { WorkspaceConnection } from './Workspace'
import { clientData } from '../../../shared/client-data'
import { keep, readKept } from '../kept'

// Long enough to read a sentence, short enough not to linger over the work.
const NOTICE_FOR = 6000

export async function workspaceApi(connection: WorkspaceConnection, server: RemoteServer, onPhone: boolean) {
  // A server older than service:about answers only the whole bootstrap.
  const readAbout = () => connection.call('service:about').catch(() => connection.call('service:bootstrap'))
  const asked = readAbout()
  const serverVersion = (): Promise<string> => readAbout().then((about) => about.version ?? '', () => '')
  // What it said last time opens the workspace at once, on what the client kept, while the link is still being made.
  const aboutKey = `server:${server.id}:about`
  const known = await readKept<Pick<Awaited<typeof asked>, 'platform' | 'home'>>(aboutKey)
  void asked.then((about) => keep(aboutKey, { platform: about.platform, home: about.home }), () => undefined)
  const bootstrap = known ?? await asked
  const call = <T,>(name: string, ...args: unknown[]): Promise<T> => connection.call(name as keyof CoreMethods, ...args as Parameters<CoreMethods[keyof CoreMethods]>) as Promise<T>
  // What this client reads of the server, as every client does, and kept here so it opens on that while the link is made.
  const data = clientData({
    call,
    hear: (channel, said) => connection.on((event) => { if (event.name === channel) said(event.args[0] as never) }),
    keeps: { prefix: `server:${server.id}`, read: readKept, keep },
  })
  connection.onReconnected?.(() => data.reconnected())
  const folderHost: HostView = { id: ':remote-server', name: server.name, address: '', user: '', port: 0, auth: 'key', state: 'up', remembered: false, canRemember: false }
  let noticeTimer: number | undefined
  const report = (error: Error): void => {
    // A call lost to a dropped link, which the reconnecting pill already says: not a fault to show.
    if (error.message === LINK_DOWN) return
    // What failed with nowhere else to say it: the product's own pill along the bottom, gone by itself or on a tap.
    document.getElementById('remote-workspace-error')?.remove()
    window.clearTimeout(noticeTimer)
    const notice = document.createElement('div')
    notice.id = 'remote-workspace-error'
    notice.className = document.documentElement.classList.contains('phone') ? 'phone-notice' : 'toast'
    notice.setAttribute('role', 'alert')
    notice.textContent = error.message
    notice.addEventListener('click', () => notice.remove())
    document.body.append(notice)
    noticeTimer = window.setTimeout(() => notice.remove(), NOTICE_FOR)
  }
  const showFile = async (rootPath: string, path: string): Promise<void> => {
    const { FileView } = await import('../chat/FileView')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const close = (): void => { root.unmount(); container.remove() }
    root.render(<FileView root={rootPath} path={path} onClose={close} />)
  }
  const chooseFolder = async (): Promise<string | undefined> => {
    const { HostFolders } = await import('../chat/HostFolders')
    return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let selected: string | undefined
    const close = (): void => { root.unmount(); container.remove(); resolve(selected) }
    root.render(<HostFolders host={folderHost} onClose={close} onAdded={(path) => { selected = path }} />)
    })
  }
  const localInvoke = async (channel: string): Promise<RendererArgument> => {
    switch (channel) {
      case 'chat:addProject': return chooseFolder()
      case 'settings:accessibility': return true
      case 'phone:state': return { count: 0, trouble: 'Use geckit pair on the server to connect another device.' }
      case 'update:view': return { state: 'off', version: await serverVersion(), offered: '', channel: 'stable', percent: 0, message: 'Update the GeckIt service on the server.', waitingFor: [] } satisfies UpdateView
      default: throw new Error('This action requires a desktop on the server.')
    }
  }
  const quiet = new Set(['chat:listStatus'])
  const ownCalls = new Set(['chat:addProject', 'settings:accessibility', 'phone:state', 'update:view', 'settings:pickApp', 'configuration:reveal', 'configuration:export', 'configuration:import', 'update:check'])
  const transport: RendererTransport = {
    invoke: async <Result,>(channel: string, ...args: readonly RendererArgument[]): Promise<Result> => {
      try {
        if (ownCalls.has(channel)) return await localInvoke(channel) as Result
        return await connection.call(channel as keyof CoreMethods, ...args as Parameters<CoreMethods[keyof CoreMethods]>) as Result
      } catch (error) {
        // The connection lives in the page around this frame, so its errors are another window's Error and fail instanceof here.
        const failure = error instanceof Error ? error : new Error(typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message : String(error))
        if (failure.message === 'Unknown GeckIt method.') {
          const older = new Error('GeckIt on the server is older than this app. Update it there to use this.')
          if (!quiet.has(channel)) report(older)
          throw older
        }
        report(failure)
        throw error
      }
    },
    send: (channel, ...args) => {
      if (channel === 'clipboard:write') {
        const text = args[0]
        const html = args[1]
        if (typeof text === 'string') {
          const write = typeof html === 'string' && html !== '' && typeof ClipboardItem !== 'undefined'
            ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
            : navigator.clipboard.writeText(text)
          void write.catch(report)
        }
        return
      }
      if (channel === 'open:link') {
        const href = args[0]
        if (typeof href === 'string' && /^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer')
        return
      }
      if (['chat:openFile', 'chat:reveal', 'chat:fileMenu'].includes(channel)) {
        const root = args[0]
        const path = args[1]
        if (typeof root === 'string' && typeof path === 'string') void showFile(root, path).catch(report)
        return
      }
      if (channel === 'errors:hold') { console.error(...args); return }
      if (['chat:open', 'chat:listening', 'voice:form', 'errors:answer'].includes(channel)) return
      void transport.invoke(channel, ...args).catch(() => undefined)
    },
    listen: <Value,>(channel: string, said: (value: Value) => void): (() => void) => {
      const local = (event: Event): void => { if (event instanceof CustomEvent) said(event.detail as Value) }
      window.addEventListener(`remote:${channel}`, local)
      const off = connection.on((event) => { if (event.name === channel) said(event.args[0] as Value) })
      return () => { off(); window.removeEventListener(`remote:${channel}`, local) }
    },
  }
  const api = createRendererApi(transport, {
    platform: bootstrap.platform,
    home: bootstrap.home,
    pathFor: () => { const error = new Error('Choose an attachment on the server. Local file paths cannot be used there.'); report(error); throw error },
  }, data)
  // How this client looks, which projects it shows and whether it counts or sends errors are its own, whatever the server has.
  const owned = clientOwn(`server:${server.id}:own`)
  const settingsKey = `server:${server.id}:settings`
  const errors = phoneErrors(() => owned.mine().sendErrors === true, () => void settings.set({ sendErrors: true }))
  const counting = (name: EventName): void => {
    if (owned.mine().analytics !== true || owned.mine().analyticsAsked !== true) return
    void countEvent(owned.client(), name, onPhone ? 'phone server' : 'remote desktop')
  }
  const settings = {
    ...api.settings,
    // What the computer said last time first, so the workspace opens as it was left, then what it says now.
    get: async (): Promise<Settings> => {
      const fresh = api.settings.get().then((now) => { void keep(settingsKey, now); return now })
      const kept = await readKept<Settings>(settingsKey)
      if (kept === undefined) return owned.own(await fresh)
      void fresh.then((now) => { window.dispatchEvent(new CustomEvent('remote:settings:changed', { detail: now })) }, () => undefined)
      return owned.own(kept)
    },
    set: async (change: Partial<Settings>): Promise<Settings> => {
      const { here, there } = owned.take(change)
      if (change.sendErrors !== undefined) errors.follow(change.sendErrors)
      if (change.analytics === true) counting('phoneOpened')
      if (Object.keys(here).length === 0 || Object.keys(there).length > 0) return owned.own(await api.settings.set(there))
      const now = owned.own(owned.last() ?? (await api.settings.get()))
      window.dispatchEvent(new CustomEvent('remote:settings:changed', { detail: now }))
      return now
    },
    on: (said: (settings: Settings) => void): (() => void) => api.settings.on((settings) => said(owned.own(settings))),
  }
  // This client's errors are held here and sent from here, under its own answer.
  const clientErrors = {
    question: errors.question,
    onQuestion: errors.onQuestion,
    answer: errors.answer,
    hold: (name: string, message: string, stack: string): void => { if (message !== LINK_DOWN) errors.hold(name, message, stack) },
  }
  counting('phoneOpened')
  const hosts = {
    ...api.hosts,
    folders: (id: string, path?: string) => id === folderHost.id ? connection.call('chat:folders', path) : api.hosts.folders(id, path),
    addFolderSaying: async (id: string, path: string) => {
      if (id !== folderHost.id) return api.hosts.addFolderSaying(id, path)
      try { await connection.call('chat:rememberProject', path); return { root: path } }
      catch (error) { return { problem: error instanceof Error ? error.message : String(error) } }
    },
  }
  const phone: PhoneCalls = {
    connected: () => true,
    onConnection: () => () => undefined,
    folders: (path) => connection.call('chat:folders', path),
    firstAsked: (id) => connection.call('chat:firstAsked', id),
    version: async () => (await serverVersion()) || 'Version unavailable',
    readOrders: (text) => connection.call('orders:read', text),
    doOrders: () => connection.call('orders:do'),
    startVideo: (extension) => connection.call('recording:start', extension),
    videoPart: (base64) => connection.call('recording:part', base64),
    keepVideo: () => { void connection.call('recording:keep').catch(report) },
    dropVideo: () => { void connection.call('recording:drop').catch(report) },
    recorded: (recording) => { window.dispatchEvent(new CustomEvent('remote:chat:recorded', { detail: recording })) },
    localFetch: (request) => connection.call('local:fetch', request),
    forwardLink: (root, href) => connection.call('hosts:forwardLink', root, href),
    pushToken: (token) => { void connection.call('push:token', token).catch(() => undefined) },
    away: (on) => { void connection.call('push:here' as keyof CoreMethods, ...([on] as unknown as Parameters<CoreMethods[keyof CoreMethods]>)).catch(() => undefined) },
  }
  if (onPhone) {
    Object.defineProperty(window, 'geckitPhone', { value: phone })
    // Where Apple reaches this phone, said by iOS before this workspace was opened.
    const token = (window.parent as { geckitPushToken?: string }).geckitPushToken
    if (token !== undefined) phone.pushToken(token)
  }
  return { ...api, settings, errors: clientErrors, hosts }
}
