import type { WorkspaceMount } from './Workspace'

function scopedStorage(storage: Storage, prefix: string): Storage {
  const keys = (): string[] => Array.from({ length: storage.length }, (_item, index) => storage.key(index)).filter((key): key is string => key !== null && key.startsWith(prefix))
  return {
    get length() { return keys().length },
    key: (index) => keys()[index]?.slice(prefix.length) ?? null,
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => { storage.setItem(prefix + key, value) },
    removeItem: (key) => { storage.removeItem(prefix + key) },
    clear: () => { for (const key of keys()) storage.removeItem(key) },
  }
}

let mounted = false
window.mountRemoteWorkspace = async ({ connection, server, phone, source }: WorkspaceMount): Promise<void> => {
  if (mounted) return
  mounted = true
  document.documentElement.classList.toggle('phone', phone)
  document.documentElement.classList.toggle('framed', phone || window.parent.document.documentElement.classList.contains('framed'))
  document.documentElement.classList.add('remote-workspace-page')
  Object.defineProperty(window, 'localStorage', { value: scopedStorage(window.localStorage, `remote:${server.id}:`) })
  Object.defineProperty(window, 'sessionStorage', { value: scopedStorage(window.sessionStorage, `remote:${server.id}:`) })
  window.updateRemoteComputer = (computer) => { window.geckitRemoteComputer = computer; window.dispatchEvent(new Event('geckit:computer')) }
  if (source !== undefined) window.updateRemoteComputer(source)
  const { workspaceApi } = await import('./workspace-api')
  const api = await workspaceApi(connection, server, phone)
  Object.defineProperty(window, 'geckit', { value: api })
  if (phone) {
    const [{ createRoot }, { createElement }, { Computer }] = await Promise.all([import('react-dom/client'), import('react'), import('./Computer')])
    const bar = document.createElement('div')
    bar.id = 'remote-computer-bar'
    document.body.prepend(bar)
    createRoot(bar).render(createElement(Computer))
  }
  await import('../chat/main')
}
