import '../../../src/preload'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { ChatSession, SessionMessage } from '../../../src/shared/api'
import { fixture, releasePending, source, sourceDraft, sourceItems } from './electron'
import '../../../src/renderer/src/styles.css'
import './fixture.css'

const params = new URLSearchParams(location.search)
if (localStorage.getItem('drafts') === null) localStorage.setItem('drafts', JSON.stringify({ [source.id]: sourceDraft }))
document.documentElement.classList.add(params.get('phone') === '1' ? 'phone' : 'framed')
const originalSource = JSON.stringify(source)
const originalItems = JSON.stringify(sourceItems)
const { Chat } = await import('../../../src/renderer/src/chat/Chat')
const root = document.getElementById('root')
const toolbar = document.getElementById('fixture')
if (root === null || toolbar === null) throw new Error('Fixture elements are missing.')
createRoot(root).render(createElement(Chat))
toolbar.innerHTML = `<details><summary>Fixture evidence and controls</summary><p>Synthetic Electron boundary. No real provider requests or native disk writes.</p><div class="fixture-controls"><label><input id="fail-export" type="checkbox"> Fail export</label><label><input id="fail-copy" type="checkbox"> Fail copy</label><label><input id="fail-create" type="checkbox"> Fail creation/send</label><label><input id="fail-models" type="checkbox"> Unavailable model catalog</label><label><input id="hold-actions" type="checkbox"> Hold export/copy/create</label><label><input id="hold-models" type="checkbox"> Hold model loading</label><button id="release" type="button">Release pending</button><button id="theme" type="button">Toggle theme</button><button id="reset" type="button">Reset fixture</button></div><pre id="evidence" aria-live="off"></pre></details>`
const evidence = toolbar.querySelector('#evidence')
type FixtureDrafts = Partial<{ readonly [id in ChatSession['id']]: SessionMessage['text'] }>
const sourceDraftNow = (): string | undefined => {
  const stored = JSON.parse(localStorage.getItem('drafts') ?? '{}') as FixtureDrafts
  return stored[source.id]
}
const renderEvidence = (): void => {
  if (evidence === null) return
  evidence.textContent = JSON.stringify({
    viewport: { width: innerWidth, height: innerHeight, phone: params.get('phone') === '1', theme: document.documentElement.dataset['theme'] },
    exports: fixture.exports, exportRequests: fixture.exportRequests, copyRequests: fixture.copies, continuationRequests: fixture.continuations,
    preparedCopies: fixture.prepared, draftSaveRequests: fixture.savedDrafts, explicitMessageRequests: fixture.messageSends,
    simulatedProviderCreates: fixture.providerCreates, simulatedProviderSends: fixture.providerSends, simulatedQueueAdds: fixture.queueAdds,
    sourceMessageRequests: fixture.messageSends.filter((message) => message.session === source.id),
    destinations: fixture.destinations, openedFiles: fixture.openedFiles,
    pendingActions: fixture.pendingActions, pendingModels: fixture.pendingModels,
    sourcePreserved: JSON.stringify(source) === originalSource,
    sourceTranscriptPreserved: JSON.stringify(sourceItems) === originalItems,
    sourceDraftPreserved: sourceDraftNow() === sourceDraft,
    sourceDraft: sourceDraftNow(), sourceGoal: source.goal, sourceQueue: source.queued,
    realProviderCalls: 0, unexpectedCalls: fixture.unexpectedCalls,
    modelRequests: fixture.modelRequests,
    lastBoundarySends: fixture.sends.slice(-8),
  }, null, 2)
}
const toggle = (id: string, update: (checked: boolean) => void): void => {
  toolbar.querySelector<HTMLInputElement>(id)?.addEventListener('change', (event) => {
    if (event.currentTarget instanceof HTMLInputElement) update(event.currentTarget.checked)
  })
}
toggle('#fail-export', (checked) => { fixture.failExport = checked })
toggle('#fail-copy', (checked) => { fixture.failCopy = checked })
toggle('#fail-create', (checked) => { fixture.failCreate = checked })
toggle('#fail-models', (checked) => { fixture.failModels = checked })
toggle('#hold-actions', (checked) => { fixture.holdActions = checked })
toggle('#hold-models', (checked) => { fixture.holdModels = checked })
toolbar.querySelector('#release')?.addEventListener('click', () => {
  releasePending()
  for (const id of ['#hold-actions', '#hold-models']) {
    const control = toolbar.querySelector<HTMLInputElement>(id)
    if (control !== null) control.checked = false
  }
})
toolbar.querySelector('#theme')?.addEventListener('click', () => {
  void window.geckit.settings.set({ theme: document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark' })
})
toolbar.querySelector('#reset')?.addEventListener('click', () => { localStorage.clear(); location.reload() })
setInterval(renderEvidence, 200)
renderEvidence()
