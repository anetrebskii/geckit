import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Geckit } from '../../../src/preload'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import type { BrowserBridgeState, Settings, TestBrowsersState } from '../../../src/shared/api'
import '../../../src/renderer/src/styles.css'
import './fixture.css'

type Profile = TestBrowsersState['profiles'][number]
type ProfileCall = Pick<Profile, 'name'> & { readonly action: 'create' | 'open' | 'update' | 'delete' | 'sign-in' | 'end-view'; readonly note?: Profile['note'] }
const params = new URLSearchParams(location.search)
const initial: Profile[] = [
  { name: 'cws-publisher', note: 'Chrome Web Store developer dashboard as alex.netrebskiy@gmail.com', open: false },
  { name: 'twinsai-google', note: 'Google Cloud Console as alex@twinsai.com, production OAuth secret rotation', open: true },
  { name: 'zabokni-design-integration', open: false },
]
let profiles: TestBrowsersState['profiles'] = params.get('empty') === '1' ? [] : initial
const fixture = { calls: [] as ProfileCall[], viewInputs: [] as Parameters<Geckit['browser']['viewInput']>[], failCreate: false, failOpen: false, failDelete: false, failView: false, failState: false, hold: false, pending: 0, release: (): void => undefined }
Object.defineProperty(window, 'browserProfileFixture', { value: fixture, configurable: true })
const waiting = new Set<() => void>()
fixture.release = (): void => { fixture.hold = false; for (const resolve of waiting) resolve(); waiting.clear() }
const wait = async (): Promise<void> => { if (!fixture.hold) return; fixture.pending++; await new Promise<void>((resolve) => waiting.add(resolve)); fixture.pending-- }
const snapshot = (): BrowserBridgeState => ({ supported: true, connected: true, folder: '/Fixture/chrome-extension', modelServer: true, model: { state: 'ready', received: 10, total: 10 }, testing: { supported: true, ...(params.get('install') === 'absent' ? {} : { version: '158.0.1-beta.41' }), ...(params.get('install') === 'downloading' ? { download: { received: 50_000_000, total: 158_000_000, phase: 'downloading' as const } } : {}), ...(params.get('install') === 'installing' ? { download: { received: 158_000_000, total: 158_000_000, phase: 'installing' as const } } : {}), ...(params.get('install') === 'failed' ? { download: { received: 0, total: 0, error: 'Network interrupted' } } : {}), ...(params.get('migrated') === '1' ? { migrated: true } : {}), profiles } })
const canvas = document.createElement('canvas')
canvas.width = 640
canvas.height = 360
const context = canvas.getContext('2d')
if (context !== null) { context.fillStyle = '#f4f4f6'; context.fillRect(0, 0, 640, 360); context.fillStyle = '#1d1d1f'; context.font = '20px sans-serif'; context.fillText('Synthetic live sign-in boundary', 100, 150); context.font = '14px sans-serif'; context.fillText('No website or account is contacted.', 100, 185) }
const browser: Geckit['browser'] = {
  state: async () => { if (fixture.failState) throw new Error('Fixture browser state failed: remote computer disconnected.'); return snapshot() },
  fetchModel: async () => undefined,
  deleteModel: async () => undefined,
  openFolder: async () => undefined,
  account: async (name, note) => { fixture.calls.push({ action: 'create', name, note }); await wait(); if (fixture.failCreate) throw new Error('Fixture create failed: profile directory is not writable.'); if (profiles.some((one) => one.name === name)) throw new Error(`A profile named ${name} already exists. Choose another name.`); profiles = [...profiles, { name, note, open: false }] },
  openTest: async (name) => { fixture.calls.push({ action: 'open', name }); await wait(); if (fixture.failOpen) throw new Error('Fixture open failed: Camoufox could not start.'); profiles = profiles.map((one) => one.name === name ? { ...one, open: true } : one) },
  updateTest: async (name, next, note) => { fixture.calls.push({ action: 'update', name, note }); await wait(); if (profiles.some((one) => one.name === name && one.open) && next !== name) throw new Error(`Close geckit:${name} before renaming it.`); if (next !== name && profiles.some((one) => one.name === next)) throw new Error(`A profile named ${next} already exists. Choose another name.`); profiles = profiles.map((one) => one.name === name ? { name: next, open: one.open, ...(note.trim() === '' ? {} : { note: note.trim() }) } : one) },
  deleteTest: async (name) => { fixture.calls.push({ action: 'delete', name }); await wait(); if (fixture.failDelete) throw new Error('Fixture delete refused: another conversation owns this browser.'); profiles = profiles.filter((one) => one.name !== name) },
  viewStart: async (name) => { fixture.calls.push({ action: 'sign-in', name }); await wait(); if (fixture.failView) throw new Error('Fixture live view failed: browser unavailable.'); return { width: 640, height: 360 } },
  viewFrame: async () => ({ jpeg: canvas.toDataURL('image/jpeg').split(',')[1] ?? '', width: 640, height: 360, url: 'https://fixture.example/sign-in', title: 'Fixture sign-in page' }),
  viewInput: async (...input) => { fixture.viewInputs.push(input) },
  viewEnd: async (name) => { fixture.calls.push({ action: 'end-view', name }) },
}
const native: Pick<Geckit, 'platform' | 'home' | 'browser'> = { platform: 'darwin', home: '/Users/fixture', browser }
Object.defineProperty(window, 'geckit', { value: native, configurable: true })
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
const { SettingsDialog } = await import('../../../src/renderer/src/ui/SettingsDialog')

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, chromeBridge: true })
  const [open, setOpen] = useState(true)
  const [, rerender] = useState(0)
  const read = (): void => rerender((value) => value + 1)
  return <>
    <nav className="profile-fixture-controls" aria-label="Fixture controls">
      <a href="?theme=light">Light</a><a href="?theme=dark">Dark</a>
      <button type="button" onClick={() => { profiles = []; read() }}>Empty list</button>
      <button type="button" onClick={() => { profiles = initial; read() }}>Reset profiles</button>
      <button type="button" onClick={() => { profiles = Array.from({ length: 12 }, (_, index) => ({ name: `long-project-browser-profile-${index}`, note: 'A long account note identifies this profile as GitHub and Google Cloud Console as alex@example.com for production work.', open: false })); read() }}>Long list</button>
      <label><input type="checkbox" onChange={(event) => { fixture.failCreate = event.target.checked }} />Fail create</label>
      <label><input type="checkbox" onChange={(event) => { fixture.failOpen = event.target.checked }} />Fail open</label>
      <label><input type="checkbox" onChange={(event) => { fixture.failDelete = event.target.checked }} />Fail delete</label>
      <label><input type="checkbox" onChange={(event) => { fixture.failState = event.target.checked }} />Fail refresh</label>
      <label><input type="checkbox" onChange={(event) => { fixture.failView = event.target.checked }} />Fail sign-in</label>
      <label><input type="checkbox" onChange={(event) => { fixture.hold = event.target.checked; if (!fixture.hold) fixture.release() }} />Hold operations</label>
      <button type="button" onClick={() => { fixture.release(); read() }}>Release operations</button>
      <button type="button" onClick={read}>Read receipt</button>
    </nav>
    {open ? <SettingsDialog settings={settings} first="integrations" change={(change) => setSettings((current) => ({ ...current, ...change }))} onClose={() => setOpen(false)} onShortcuts={() => undefined} /> : <button className="quiet profile-fixture-launch" type="button" onClick={() => setOpen(true)}>Open Settings</button>}
    <details className="profile-fixture-evidence"><summary>Synthetic native boundary: {fixture.calls.length} calls, {fixture.pending} pending</summary><pre>{JSON.stringify({ calls: fixture.calls, viewInputs: fixture.viewInputs, pending: fixture.pending, profiles }, null, 2)}</pre></details>
  </>
}
const root = document.getElementById('root')
if (root === null) throw new Error('Missing fixture root')
createRoot(root).render(<App />)
