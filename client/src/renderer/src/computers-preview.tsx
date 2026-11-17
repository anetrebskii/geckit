import { createRoot } from 'react-dom/client'
import type { ConnectionStorage, SavedServer } from '../../shared/remote/storage'

// The saved computers list on its own, with `phone`, `theme=dark`, `computers=<n>` and `add` to open the sheet that connects one.
const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const names = ['Alexs-MacBook-Pro.local', 'Studio Mac', 'render-box', 'Home iMac']
let saved: SavedServer[] = names.slice(0, Number(query.get('computers') ?? 2)).map((name, index) => ({ server: { id: `computer-${String(index)}`, name, publicKey: '' }, device: '', key: '', signal: '', projects: [], manager: true, ...(index === 2 ? {} : { full: true as const }), ...(index === 1 ? { label: 'Office' } : {}) }))
const connectionStorage: ConnectionStorage = {
  publicKey: () => Promise.resolve(''),
  sign: () => Promise.resolve(''),
  list: () => Promise.resolve(saved),
  remember: () => Promise.resolve(),
  forget: (id) => { saved = saved.filter((one) => one.server.id !== id); return Promise.resolve() },
  name: (id, label) => { saved = saved.map((one) => one.server.id !== id ? one : label.trim() === '' ? { server: one.server, device: one.device, key: one.key, signal: one.signal, projects: one.projects, manager: one.manager, ...(one.full === true ? { full: true as const } : {}) } : { ...one, label }); return Promise.resolve() },
}
Object.assign(window, { geckit: { connectionStorage } })
await import('./styles.css')
const { Servers } = await import('./remote/Servers')
createRoot(document.getElementById('root') as HTMLElement).render(<Servers onClose={() => console.warn('[preview] closed')} {...(query.has('phone') ? { scan: () => Promise.resolve(undefined) } : {})} {...(query.has('add') ? { initialServer: ':add' } : {})} />)
