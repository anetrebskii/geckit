import '../../../src/preload'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { fixture } from './electron'
import { dropFiles, runDropRegression } from './regression'
import '../../../src/renderer/src/styles.css'

localStorage.clear()
document.documentElement.classList.add('framed')
const { Chat } = await import('../../../src/renderer/src/chat/Chat')
createRoot(document.getElementById('root') as HTMLElement).render(createElement(Chat))
const toolbar = document.getElementById('fixture') as HTMLElement
toolbar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:8px;background:var(--bg-sunken);color:var(--text);z-index:9999;font:12px var(--font);border-top:1px solid var(--border);max-height:96px;overflow:auto'
document.getElementById('root')?.style.setProperty('height', 'calc(100% - 98px)')
toolbar.innerHTML = `<label>Target <select id="target"><option value=".new-task-text">Task/question text</option><option value=".new-task-goal">Goal</option><option value=".new-task-head">Form header</option><option value=".form-scrim">Backdrop</option><option value=".chat">Background Chat</option></select></label> <button id="drop">Drop two fixture files</button> <button id="regress">Run regression checks</button> <button id="theme">Toggle theme</button> <button id="reset">Reset fixture</button><pre id="evidence"></pre>`
const output = toolbar.querySelector('#evidence') as HTMLElement
const evidence = (): void => {
  output.textContent = JSON.stringify({ sends: fixture.sends, uploads: fixture.uploads, paths: fixture.paths, drafts: localStorage.getItem('drafts'), formText: document.querySelector<HTMLTextAreaElement>('.new-task-text')?.value, dragSubscriptions: [...fixture.subscriptions.keys()].filter((name) => /drag|drop/i.test(name)) })
}
setInterval(evidence, 100)
toolbar.querySelector('#drop')?.addEventListener('click', () => {
  const selected = toolbar.querySelector<HTMLSelectElement>('#target')?.value ?? ''
  const target = document.querySelector(selected)
  if (target === null) { output.textContent = `Missing target ${selected}`; return }
  dropFiles(target)
  setTimeout(evidence, 0)
})
toolbar.querySelector('#theme')?.addEventListener('click', () => { document.documentElement.dataset['theme'] = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark' })
toolbar.querySelector('#reset')?.addEventListener('click', () => location.reload())

toolbar.querySelector('#regress')?.addEventListener('click', () => {
  void runDropRegression().then((checks) => {
    const result = document.createElement('pre')
    result.id = 'regression-results'
    result.style.cssText = 'white-space:pre-wrap;max-height:180px;overflow:auto'
    result.textContent = JSON.stringify({ passed: checks.every((one) => one.passed) && fixture.sends === 0 && fixture.uploads === 0, sends: fixture.sends, uploads: fixture.uploads, checks }, null, 2)
    document.getElementById('regression-results')?.remove()
    toolbar.append(result)
    toolbar.style.maxHeight = '260px'
  }).catch((error: Error) => {
    const result = document.createElement('pre')
    result.id = 'regression-results'
    result.textContent = JSON.stringify({ passed: false, error: error.message })
    document.getElementById('regression-results')?.remove()
    toolbar.append(result)
  })
})
