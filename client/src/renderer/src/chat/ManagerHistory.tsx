import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

import type { ManagerHistoryRequest, ManagerThread, ManagerView } from '../../../shared/manager'
import { MANAGER_MAIN_THREAD } from '../../../shared/manager'
import { useBack } from '../phone-back'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'

type Target = Pick<ManagerThread, 'title' | 'place'> & { readonly request: ManagerHistoryRequest }

function Confirm({ target, opener, onClose, onDone }: { readonly target: Target; readonly opener: RefObject<HTMLButtonElement | null>; readonly onClose: () => void; readonly onDone: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const latest = useRef(onClose)
  useEffect(() => { latest.current = onClose }, [onClose])
  useBack(() => { if (!pending.current) latest.current() }, dialog)
  useEffect(() => {
    const returnTo = opener.current
    cancel.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!pending.current) latest.current() }
      if (event.key !== 'Tab') return
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      const first = buttons?.[0]
      const last = buttons?.[buttons.length - 1]
      if (first === undefined) event.preventDefault()
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); returnTo?.focus() }
  }, [opener])
  const clear = target.request.action === 'clear'
  const submit = (): void => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    void window.geckit.manager.history(target.request).then(onDone, (caught: Error) => setError(caught.message)).finally(() => { pending.current = false; setBusy(false) })
  }
  return createPortal(<div className="dialog-scrim" onMouseDown={(event) => { event.stopPropagation(); if (!pending.current && event.target === event.currentTarget) onClose() }}><div ref={dialog} className="dialog manager-session" role="dialog" aria-modal="true" aria-labelledby="manager-history-title">
    <header><h2 id="manager-history-title">{clear ? 'Clear history?' : 'Delete conversation?'}</h2></header>
    <p><strong>{target.title}</strong> · {target.place ?? 'GeckIt'}</p>
    <p>{clear ? "All messages and Manager's context in this conversation will be removed. This cannot be undone." : 'This Manager conversation and its history will be removed. This cannot be undone.'}</p>
    <p>This stops Manager's response and cancels queued messages in this conversation. Working tasks, projects, employees and settings are kept.</p>
    {target.place === undefined ? clear ? null : <p>A new empty GeckIt conversation will be available.</p> : <p>Messages already posted in the channel are kept. The next incoming request starts with empty Manager context.</p>}
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button ref={cancel} type="button" className="quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary danger" disabled={busy} onClick={submit}>{busy ? clear ? 'Clearing history…' : 'Deleting conversation…' : clear ? 'Clear history' : 'Delete conversation'}</button></div>
  </div></div>, document.body)
}

export function ManagerHistory({ view, thread, connected, onDeleted }: { readonly view: ManagerView; readonly thread: ManagerThread | undefined; readonly connected: boolean; readonly onDeleted: () => void }): React.JSX.Element {
  const opener = useRef<HTMLButtonElement>(null)
  const pending = thread === undefined ? view.historyPending : thread.historyPending
  const [anchor, setAnchor] = useState<DOMRect>()
  const [target, setTarget] = useState<Target>()
  return <>
    <button ref={opener} type="button" className="quiet small" disabled={!connected || view.appChat !== true} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>Conversation actions <Icon name="down" size={11} /></button>
    {anchor === undefined ? null : <Menu anchor={anchor} title="Conversation actions" autoFocus {...(pending === undefined ? {} : { note: 'Finish incomplete cleanup before sending a new message.' })} choices={pending === undefined ? [{ value: 'clear', label: 'Clear history…', danger: true }, { value: 'delete', label: 'Delete conversation…', danger: true }] : [{ value: pending.action, label: pending.action === 'clear' ? 'Retry clearing history…' : 'Retry deleting conversation…', danger: true }]} onClose={() => setAnchor(undefined)} onPick={(action) => {
      setAnchor(undefined)
      if (action !== 'clear' && action !== 'delete') return
      setTarget({ title: thread?.title ?? 'Manager', ...(thread?.place === undefined ? {} : { place: thread.place }), request: pending ?? { id: thread?.id ?? MANAGER_MAIN_THREAD, ...(view.session === undefined ? {} : { session: view.session.id }), ...(view.historyRevision === undefined ? {} : { historyRevision: view.historyRevision }), action } })
    }} />}
    {target === undefined ? null : <Confirm target={target} opener={opener} onClose={() => setTarget(undefined)} onDone={() => { if (target.request.action === 'delete') onDeleted(); setTarget(undefined) }} />}
  </>
}
