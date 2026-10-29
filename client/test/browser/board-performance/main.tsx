import '../../../src/preload'
import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { changeCard, fixture, snapshot, source, stream } from './electron'
import '../../../src/renderer/src/styles.css'
import '../conversation-export/fixture.css'

localStorage.removeItem('drafts')
await window.geckit.settings.set({ chatView: 'board', boardColumns: [], conversationPlace: 'below', boardHeight: 260 })
document.documentElement.classList.add('framed')
const { Chat } = await import('../../../src/renderer/src/chat/Chat')
const root = document.getElementById('root')
const toolbar = document.getElementById('fixture')
if (root === null || toolbar === null) throw new Error('Missing fixture containers')
createRoot(root).render(createElement(StrictMode, null, createElement(Chat)))
toolbar.innerHTML = '<details><summary>Board fixture controls</summary><p>Actual Chat, synthetic native boundary. No real provider or disk writes.</p><div class="fixture-controls"><button id="repeat">Repeat unchanged snapshot</button><button id="change">Change one card</button><button id="stream">Start stream</button><button id="theme">Toggle theme</button></div><pre id="evidence"></pre></details>'
let streaming: ReturnType<typeof setInterval> | undefined
let streamed = 0
let snapshots = 0
const evidence = (): void => {
  const output = toolbar.querySelector('#evidence')
  if (output !== null) output.textContent = JSON.stringify({ streamed, snapshots, cards: fixture.destinations.length + 1, source: source.id, sends: fixture.sends.slice(-6), providerSends: fixture.providerSends }, null, 2)
}
toolbar.querySelector('#repeat')?.addEventListener('click', () => { snapshot(); snapshots++; evidence() })
toolbar.querySelector('#change')?.addEventListener('click', () => { changeCard(); evidence() })
toolbar.querySelector('#stream')?.addEventListener('click', (event) => {
  if (streaming !== undefined) { clearInterval(streaming); streaming = undefined }
  else streaming = setInterval(() => { stream(`Streamed reply ${String(++streamed)}`); evidence() }, 100)
  if (event.currentTarget instanceof HTMLButtonElement) event.currentTarget.textContent = streaming === undefined ? 'Start stream' : 'Stop stream'
})
toolbar.querySelector('#theme')?.addEventListener('click', () => {
  void window.geckit.settings.set({ theme: document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark' })
})
evidence()
