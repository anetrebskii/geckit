import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { SessionItems, Settings } from '../../../shared/api'
import type { ManagerView } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { updatedItems } from '../../../shared/transcript-items'
import { Icon } from '../ui/Icon'
import { Files } from './Prose'
import { Transcript } from './Transcript'
import { managerAssistant, managerStand } from './manager-label'
import { managerLabel, useManager } from './useManager'

interface InspectionRead extends Pick<SessionItems, 'id' | 'items'> { readonly attempt: number }

const noop = (): void => undefined

export function ManagerStatus({ settings, onSettings }: { readonly settings: Settings; readonly onSettings: () => void }): React.JSX.Element {
  const view = useManager()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return <>
    <button type="button" className="assistant-open manager-status" disabled={view === undefined} aria-haspopup="dialog" aria-expanded={open} title="Inspect the Manager session" onClick={() => { if (view?.session === undefined) onSettings(); else setOpen(true) }}><Icon name="terminal" size={12} /><span>{view !== undefined && view.session === undefined ? 'Set up Manager' : 'Manager'}</span>{view !== undefined && view.session === undefined ? null : <span className="manager-status-label">{view === undefined ? 'Loading...' : managerLabel(view)}</span>}</button>
    {!open || view === undefined ? null : <ManagerInspection view={view} settings={settings} onClose={close} onSettings={() => { close(); onSettings() }} />}
  </>
}

export function ManagerInspection({ view, settings, onClose, onSettings }: { readonly view: ManagerView; readonly settings: Settings; readonly onClose: () => void; readonly onSettings: () => void }): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [read, setRead] = useState<InspectionRead>()
  const [failure, setFailure] = useState<Pick<InspectionRead, 'id' | 'attempt'> & { readonly text: string }>()
  const [retry, setRetry] = useState(0)
  const id = view.session?.id
  useEffect(() => {
    const before = document.activeElement
    close.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
      if ((event.ctrlKey || event.metaKey) && !['a', 'c'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopImmediatePropagation(); return }
      if (event.key !== 'Tab') return
      const controls = body.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, [tabindex="0"]')
      const first = controls?.[0]
      const last = controls?.[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (before instanceof HTMLElement) before.focus() }
  }, [onClose])
  useEffect(() => {
    if (id === undefined) return
    let here = true
    let loading = true
    const buffered: SessionItems[] = []
    const api = window.geckit.manager
    const off = api.onItems((items) => {
      if (!here || items.id !== id) return
      if (loading) buffered.push(items)
      else setRead((held) => held?.id !== id || held.attempt !== retry ? held : { id, attempt: retry, items: updatedItems(held.items, [items]) })
    })
    void Promise.resolve().then(() => api.inspect(id)).then((snapshot) => {
      if (!here || snapshot.id !== id) return
      loading = false
      setRead({ id, attempt: retry, items: updatedItems(snapshot.items, buffered) })
    }, (caught: Error) => { if (here) { loading = false; setFailure({ id, attempt: retry, text: caught.message }) } })
    return () => { here = false; off() }
  }, [id, retry])
  const error = failure !== undefined && failure.id === id && failure.attempt === retry ? failure.text : ''
  const file = useCallback((path: string): void => { if (view.session !== undefined) window.geckit.chat.openFile(view.session.root, path) }, [view.session])
  const stand = managerStand(view)
  const facts = [
    llmProviderInfo(managerAssistant(view), undefined, settings.providerPlugins).name,
    view.session?.model ?? 'Provider default',
    view.workers.length === 0 ? undefined : `${String(view.workers.length)} ${view.workers.length === 1 ? 'worker' : 'workers'}`,
    view.queued === 0 ? undefined : `${String(view.queued)} queued`,
  ].filter((fact) => fact !== undefined)
  return createPortal(<div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={body} className="dialog manager-inspection" role="dialog" aria-modal="true" aria-labelledby="manager-inspection-title">
    <header className="manager-inspection-header"><h2 id="manager-inspection-title">Manager</h2><span className="manager-stand" data-tone={stand.tone} role="status"><span className="manager-stand-dot" aria-hidden="true" /><span className="manager-stand-text">{stand.short}</span></span><button type="button" className="quiet" onClick={onSettings}>Manager settings</button><button ref={close} type="button" className="icon-button" aria-label="Close Manager" onClick={onClose}><Icon name="close" /></button></header>
    <div className="manager-inspection-info">
      <p className="manager-inspection-facts">{facts.join(' · ')}</p>
      <p>{view.config.enabled ? 'Read-only here. Send tasks and answer what it asks in Telegram.' : 'Manager disabled. What it did is kept.'}</p>
      {view.session === undefined ? null : <p className="manager-inspection-id">{view.session.id}</p>}
      {view.error === undefined ? null : <p className="manager-error" role="status">{view.error}</p>}
    </div>
    {id === undefined
      ? <div className="manager-inspection-empty"><Icon name="terminal" size={20} /><p>No Manager session yet.</p><p className="manager-inspection-hint">Set one up, then send it a task in Telegram.</p><button type="button" className="primary" onClick={onSettings}>Manager settings</button></div>
      : error !== '' ? <div className="manager-inspection-empty"><Icon name="blocked" size={20} /><p className="manager-error" role="alert">Could not load the Manager session.</p><p className="manager-inspection-hint">{error}</p><button type="button" className="quiet" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
      : read?.id !== id || read.attempt !== retry ? <div className="manager-inspection-empty" role="status"><Icon name="spinner" size={20} /><p>Loading the Manager session...</p></div>
      : read.items.length === 0 ? <div className="manager-inspection-empty"><Icon name="chat" size={20} /><p>No activity yet.</p><p className="manager-inspection-hint">Send a task in Telegram and it shows up here.</p></div>
      : <Files value={{ root: view.session?.root ?? '', onFile: file }}><Transcript at={id} items={read.items} readOnly working={view.state === 'working'} onAnswer={noop} onAgain={noop} onFile={file} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} /></Files>}
  </div></div>, document.body)
}
