import '../../../src/preload'
import { createElement, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { externalEdit, fixture, snapshot } from './electron'
import '../../../src/renderer/src/styles.css'
import '../conversation-export/fixture.css'

if (new URLSearchParams(location.search).get('phone') === '1') document.documentElement.classList.add('phone')
document.documentElement.classList.add('framed')
const { Chat } = await import('../../../src/renderer/src/chat/Chat')
const root = document.getElementById('root')
const toolbar = document.getElementById('fixture')
if (root === null || toolbar === null) throw new Error('Missing fixture containers')
if (new URLSearchParams(location.search).get('controls') === '0') {
  toolbar.style.display = 'none'
  root.style.height = '100%'
}
const rendering = { commits: 0, totalMs: 0, lastMs: 0 }
createRoot(root).render(createElement(Profiler, { id: 'Employees renderer', onRender: (_id, _phase, actualDuration) => { rendering.commits++; rendering.totalMs += actualDuration; rendering.lastMs = actualDuration } }, createElement(Chat)))
toolbar.innerHTML = '<details><summary>Employee fixture controls</summary><p>Actual renderer, synthetic IPC. No provider, real account, phone connection or disk persistence checked.</p><div class="fixture-controls"><label><input id="save-error" type="checkbox">Fail save</label><label><input id="assign-error" type="checkbox">Fail assignment</label><label><input id="guide-error" type="checkbox">Fail instruction sync</label><label>Memory <select id="memory"><option>complete</option><option>partial</option><option>unavailable</option></select></label><button id="snapshot">Repeat unchanged snapshot</button><button id="external">External employee edit</button><button id="theme">Toggle theme</button><button id="reset">Reset</button></div><pre id="evidence"></pre></details>'
toolbar.querySelector('#save-error')?.addEventListener('change', (event) => { if (event.target instanceof HTMLInputElement) fixture.failSave = event.target.checked })
toolbar.querySelector('#assign-error')?.addEventListener('change', (event) => { if (event.target instanceof HTMLInputElement) fixture.failAssignment = event.target.checked })
toolbar.querySelector('#guide-error')?.addEventListener('change', (event) => { if (event.target instanceof HTMLInputElement) fixture.failGuide = event.target.checked })
toolbar.querySelector('#memory')?.addEventListener('change', (event) => { if (event.target instanceof HTMLSelectElement) fixture.memory = event.target.value === 'partial' ? 'partial' : event.target.value === 'unavailable' ? 'unavailable' : 'complete' })
toolbar.querySelector('#snapshot')?.addEventListener('click', snapshot)
toolbar.querySelector('#external')?.addEventListener('click', externalEdit)
toolbar.querySelector('#theme')?.addEventListener('click', () => { void window.geckit.settings.set({ theme: document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark' }) })
toolbar.querySelector('#reset')?.addEventListener('click', () => { localStorage.removeItem('employees-renderer-fixture'); localStorage.removeItem('employees-renderer-large-fixture'); location.reload() })
setInterval(() => {
  const output = toolbar.querySelector('#evidence')
  if (output !== null) output.textContent = JSON.stringify({ rendering, tasks: fixture.sessions.length, employees: fixture.employees.length, assignments: fixture.assignments, sends: fixture.sends.map(({ root, text, employeeId }) => ({ root, text, employeeId })) }, null, 2)
}, 500)
