import { createRoot } from 'react-dom/client'
import type { CoreMethods } from '../../../core/application'
import type { HostView } from '../../../shared/hosts'
import type { Settings, UpdateView } from '../../../shared/api'
import { createRendererApi } from '../../../shared/renderer-api'
import type { RendererArgument, RendererTransport } from '../../../shared/renderer-api'
import type { RemoteServer } from '../../../shared/remote/protocol'
import { OWN } from '../phone-calls'
import type { PhoneCalls } from '../phone-calls'
import type { WorkspaceConnection } from './Workspace'
import { clientData } from '../../../shared/client-data'
import { keep, readKept } from '../kept'

export async function workspaceApi(connection: WorkspaceConnection, server: RemoteServer, onPhone: boolean) {
  const bootstrap = await connection.call('service:bootstrap')
  const call = <T,>(name: string, ...args: unknown[]): Promise<T> => connection.call(name as keyof CoreMethods, ...args as Parameters<CoreMethods[keyof CoreMethods]>) as Promise<T>
  // What this client reads of the server, as every client does, and kept here so it opens on that while the link is made.
  const data = clientData({
    call,
    hear: (channel, said) => connection.on((event) => { if (event.name === channel) said(event.args[0] as never) }),
    keeps: { prefix: `server:${server.id}`, read: readKept, keep },
  })
  connection.onReconnected?.(() => data.reconnected())
  const folderHost: HostView = { id: ':remote-server', name: server.name, address: '', user: '', port: 0, auth: 'key', state: 'up', remembered: false, canRemember: false }
  const report = (error: Error): void => {
    let notice = document.getElementById('remote-workspace-error')
    if (notice === null) {
      notice = document.createElement('div')
      notice.id = 'remote-workspace-error'
      notice.className = 'remote-feedback failed'
      notice.setAttribute('role', 'alert')
      notice.addEventListener('click', () => notice?.remove())
      document.body.prepend(notice)
    }
    notice.textContent = error.message
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
      case 'errors:question': return undefined
      case 'phone:state': return { count: 0, trouble: 'Use geckit pair on the server to connect another device.' }
      case 'update:view': return { state: 'off', version: '', offered: '', channel: 'stable', percent: 0, message: 'Update the GeckIt service on the server.', waitingFor: [] } satisfies UpdateView
      default: throw new Error('This action requires a desktop on the server.')
    }
  }
  const quiet = new Set(['chat:listStatus'])
  const ownCalls = new Set(['chat:addProject', 'settings:accessibility', 'errors:question', 'phone:state', 'update:view', 'settings:pickApp', 'configuration:reveal', 'configuration:export', 'configuration:import', 'update:check'])
  const transport: RendererTransport = {
    invoke: async <Result,>(channel: string, ...args: readonly RendererArgument[]): Promise<Result> => {
      try {
        if (ownCalls.has(channel)) return await localInvoke(channel) as Result
        return await connection.call(channel as keyof CoreMethods, ...args as Parameters<CoreMethods[keyof CoreMethods]>) as Result
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error))
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
  const ownKey = `server:${server.id}:own`
  const readOwn = (): Partial<Settings> => {
    try { return JSON.parse(localStorage.getItem(ownKey) ?? '{}') as Partial<Settings> } catch { return {} }
  }
  let mine = readOwn()
  let last: Settings | undefined
  const own = (settings: Settings): Settings => {
    last = settings
    const kept = { ...settings, analytics: false, analyticsAsked: false, sendErrors: false, client: '', ...mine }
    const gone = mine.profile !== undefined && mine.profile !== '' && !settings.profiles.some((one) => one.id === mine.profile)
    return gone ? { ...kept, profile: '', chatProjects: [], chatAll: true } : kept
  }
  const isOwn = (key: string): boolean => (OWN as readonly string[]).includes(key)
  const settings = {
    ...api.settings,
    get: async (): Promise<Settings> => own(await api.settings.get()),
    set: async (change: Partial<Settings>): Promise<Settings> => {
      const here = Object.fromEntries(Object.entries(change).filter(([key]) => isOwn(key)))
      const there = Object.fromEntries(Object.entries(change).filter(([key]) => !isOwn(key)))
      if (Object.keys(here).length > 0) {
        mine = { ...mine, ...here, ...(change.analytics === false ? { client: '' } : {}) }
        try { localStorage.setItem(ownKey, JSON.stringify(mine)) } catch { /* kept for this launch only */ }
      }
      if (Object.keys(there).length > 0) return own(await api.settings.set(there))
      const now = own(last ?? (await api.settings.get()))
      window.dispatchEvent(new CustomEvent('remote:settings:changed', { detail: now }))
      return now
    },
    on: (said: (settings: Settings) => void): (() => void) => api.settings.on((settings) => said(own(settings))),
  }
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
    version: async () => '',
    readOrders: (text) => connection.call('orders:read', text),
    doOrders: () => connection.call('orders:do'),
    startVideo: (extension) => connection.call('recording:start', extension),
    videoPart: (base64) => connection.call('recording:part', base64),
    keepVideo: () => { void connection.call('recording:keep').catch(report) },
    dropVideo: () => { void connection.call('recording:drop').catch(report) },
    recorded: (recording) => { window.dispatchEvent(new CustomEvent('remote:chat:recorded', { detail: recording })) },
    localFetch: (request) => connection.call('local:fetch', request),
    forwardLink: (root, href) => connection.call('hosts:forwardLink', root, href),
    pushToken: () => undefined,
    away: () => undefined,
  }
  if (onPhone) Object.defineProperty(window, 'geckitPhone', { value: phone })
  return { ...api, settings, hosts }
}
