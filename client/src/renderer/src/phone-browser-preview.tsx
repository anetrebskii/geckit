import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { BrowserBridgeState } from '../../shared/api'
import type { Chat } from './chat/useChat'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
let profiles = query.has('empty') ? [] : [{ name: 'github-work', open: true, note: 'GitHub as alex@example.com' }, { name: 'linkedin', open: false }, { name: 'stripe-test', open: false, note: 'Stripe test dashboard' }]
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const state = (): BrowserBridgeState => ({ supported: true, connected: true, folder: '', modelServer: true, model: { state: 'ready' } as BrowserBridgeState['model'], testing: { supported: true, profiles, ...(query.has('download') ? { download: { received: 42e6, total: 98e6 } } : {}) } })
const frame = { jpeg: '', width: 1280, height: 800, url: 'https://github.com/login', title: 'Sign in' }
Object.assign(window, { geckit: { browser: {
  state: async () => { await wait(query.has('slow') ? 60_000 : 400); return state() },
  account: async (name: string, note: string) => { await wait(300); profiles = [...profiles, { name, open: false, note }] },
  updateTest: async (name: string, next: string, note: string) => { await wait(300); profiles = profiles.map((one) => one.name === name ? { ...one, name: next, note } : one) },
  deleteTest: async (name: string) => { profiles = profiles.filter((one) => one.name !== name) },
  viewStart: async () => ({ width: 1280, height: 800 }), viewFrame: async () => frame, viewInput: async () => undefined, viewEnd: async () => undefined,
} } })
const { PhoneBrowser } = await import('./chat/PhoneBrowser')
function App(): React.JSX.Element {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, chromeBridge: !query.has('off') })
  const chat = { settings, change: (next: Partial<typeof settings>) => setSettings({ ...settings, ...next }) } as unknown as Chat
  return <PhoneBrowser chat={chat} host="MacBook Pro" back="Settings" onBack={() => undefined} />
}
createRoot(document.getElementById('root') as HTMLElement).render(<App />)
