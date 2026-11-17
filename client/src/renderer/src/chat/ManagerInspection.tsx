import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Settings } from '../../../shared/api'
import { modelName } from '../../../shared/api'
import type { ManagerThread, ManagerView } from '../../../shared/manager'
import { MANAGER_MAIN_THREAD } from '../../../shared/manager'
import { useBack } from '../phone-back'
import { phoneCalls } from '../phone-calls'
import { Icon } from '../ui/Icon'
import { EmployeeAvatar } from '../employees/Employees'
import { managerFace } from '../employees/TeamManager'
import { ManagerChat, threadFrom, threadName, threadOrder } from './ManagerChat'
import { NEW_CONVERSATION } from './ManagerComposer'
import { SwipeRow } from './SwipeRow'
import { Menu } from '../ui/Menu'
import { ago } from './time'
import { EdgeBack, Page } from './PhoneKit'
import { MANAGER_CHAT_EVENT } from './manager-chat-open'
import { managerStand } from './manager-label'
import { managerLabel, useManager } from './useManager'

export function ManagerStatus({ settings, onSettings, onOpen }: { readonly settings: Settings; readonly onSettings: () => void; readonly onOpen?: ((id: string) => void) | undefined }): React.JSX.Element {
  const view = useManager()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const show = useCallback((): void => { if (view === undefined) return; if (!view.config.enabled && view.session === undefined) onSettings(); else setOpen(true) }, [view, onSettings])
  useEffect(() => { window.addEventListener(MANAGER_CHAT_EVENT, show); return () => window.removeEventListener(MANAGER_CHAT_EVENT, show) }, [show])
  const setup = view !== undefined && !view.config.enabled && view.session === undefined
  return <>
    <button type="button" className="assistant-open manager-status" disabled={view === undefined} aria-haspopup="dialog" aria-expanded={open} title="Chat with Manager" onClick={show}><Icon name="chat" size={12} /><span>{setup ? 'Set up Manager' : 'Manager'}</span>{setup ? null : <span className="manager-status-label">{view === undefined ? 'Loading...' : managerLabel(view)}</span>}</button>
    {!open || view === undefined ? null : <ManagerInspection view={view} settings={settings} onClose={close} onSettings={() => { close(); onSettings() }} onOpen={onOpen === undefined ? undefined : (id) => { close(); onOpen(id) }} />}
  </>
}

function Stand({ view }: { readonly view: ManagerView }): React.JSX.Element {
  const stand = managerStand(view)
  return <span className="manager-stand" data-tone={stand.tone} role="status"><span className="manager-stand-dot" aria-hidden="true" /><span className="manager-stand-text">{stand.short}</span></span>
}

export function ManagerInspection({ view, settings, onClose, onSettings, onOpen }: { readonly view: ManagerView; readonly settings: Settings; readonly onClose: () => void; readonly onSettings: () => void; readonly onOpen?: ((id: string) => void) | undefined }): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const before = document.activeElement
    close.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (!(event.target instanceof Node) || !body.current?.contains(event.target)) return
      if (event.key === 'Escape') { if (document.querySelector('.floating.menu') !== null) return; event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = body.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]')
      const first = controls?.[0]
      const last = controls?.[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (before instanceof HTMLElement) before.focus() }
  }, [onClose])
  return createPortal(<div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={body} className="dialog manager-inspection" role="dialog" aria-modal="true" aria-labelledby="manager-inspection-title">
    <ManagerChat view={view} settings={settings} onSettings={onSettings} onOpen={onOpen}
      head={<div className="manager-identity"><EmployeeAvatar employee={managerFace(settings)} /><h2 id="manager-inspection-title">Manager</h2><Stand view={view} /></div>}
      tail={<><span className="manager-toolbar-gap" aria-hidden="true" /><button type="button" className="icon-button" aria-label="Manager settings" title="Manager settings" onClick={onSettings}><Icon name="settings" /></button><button ref={close} type="button" className="icon-button" aria-label="Close Manager" title="Close" onClick={onClose}><Icon name="close" /></button></>} />
  </div></div>, document.body)
}

export function ManagerPhone({ settings, onBack, onSettings, onOpen, back = 'Back' }: { readonly settings: Settings; readonly onBack?: () => void; readonly onSettings?: () => void; readonly onOpen?: ((id: string) => void) | undefined; readonly back?: string }): React.JSX.Element {
  const page = useRef<HTMLElement>(null)
  const [shown, setShown] = useState<string>()
  const close = useCallback(() => setShown(undefined), [])
  useBack(shown === undefined ? undefined : close, page)
  const view = useManager()
  const [connected, setConnected] = useState(() => phoneCalls()?.connected() ?? true)
  useEffect(() => phoneCalls()?.onConnection(setConnected), [])
  const canStart = view !== undefined && view.config.enabled && connected
  return <>
    <Page title="Manager" back={back} {...(onBack === undefined ? {} : { onBack })} actions={<>
      {onSettings === undefined ? null : <button type="button" className="phone-icon" aria-label="Manager settings" onClick={onSettings}><Icon name="settings" size={22} /></button>}
      <button type="button" className="phone-icon" aria-label="New conversation" disabled={!canStart} onClick={() => setShown(NEW_CONVERSATION)}><Icon name="compose" size={24} /></button>
    </>}>
      {view === undefined ? connected ? <div className="phone-group" aria-busy="true" aria-label="Reading Manager's conversations">
        {[0, 1, 2].map((one) => <div key={one} className="phone-row">
          <span className="phone-dot skeleton-dot" />
          <div className="phone-row-text"><div className="skeleton-line" /><div className="skeleton-line short" /></div>
        </div>)}
      </div> : <div className="phone-empty" role="status">Computer disconnected. Reconnect to see Manager.</div> : <ManagerList view={view} connected={connected} onPick={setShown} />}
    </Page>
    {shown === undefined || view === undefined ? null : <section ref={page} className="manager-phone manager-phone-over phone-page" aria-label="Manager chat">
      <EdgeBack onBack={close} />
      <ManagerChat key={shown} initial={shown} view={view} settings={settings} connected={connected} onSettings={onSettings} onOpen={onOpen} onBack={close} />
    </section>}
  </>
}

/** Manager's conversations as Questions lists its own: those needing an answer first, then the newest, each with where it is from and its model. */
function ManagerList({ view, connected, onPick }: { readonly view: ManagerView; readonly connected: boolean; readonly onPick: (id: string) => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState<string>()
  const [deleting, setDeleting] = useState<ManagerThread>()
  const [error, setError] = useState('')
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(tick) }, [])
  const threads = threadOrder(view.threads ?? [])
  const remove = (thread: ManagerThread): void => {
    setError('')
    void window.geckit.manager.history({ id: thread.id, ...(thread.session === undefined ? {} : { session: thread.session }), historyRevision: thread.historyRevision, action: 'delete' }).catch((caught: Error) => setError(caught.message))
  }
  return <>
    {!connected ? <div className="phone-note">Computer disconnected. Reconnect to send.</div> : null}
    {error === '' ? null : <div className="phone-note manager-error" role="alert">{error}</div>}
    {threads.length === 0 ? <div className="phone-empty">No conversations yet. Start one from the pencil above.</div> : <div className="phone-group">{threads.map((thread) => {
      const tone = thread.state === 'asks' ? 'asks' : thread.state === 'failed' ? 'failed' : thread.state === 'working' ? 'working' : 'read'
      const said = thread.state === 'asks' ? 'Needs your answer' : thread.state === 'failed' ? thread.error ?? 'Stopped' : thread.state === 'working' ? thread.note ?? 'Working' : ''
      return <SwipeRow key={thread.id} open={open === thread.id} onOpen={(on) => setOpen(on ? thread.id : undefined)} onTap={() => onPick(thread.id)} onDelete={() => setDeleting(thread)}>
        <span className={`phone-dot ${tone}`} />
        <div className="phone-row-text">
          <div className="phone-row-line"><span className="phone-row-title">{threadName(thread)}</span><span className="phone-row-time">{ago(thread.at, now)}</span></div>
          {said === '' ? null : <div className={thread.state === 'asks' ? 'phone-row-asks' : `phone-row-said${thread.state === 'working' ? ' doing' : ''}`}>{said}</div>}
          <div className="phone-row-meta"><span className="phone-row-tag">{thread.place === undefined ? 'GeckIt' : threadFrom(thread)}</span><span className="phone-row-tag">{thread.model === '' ? 'Default model' : modelName(thread.model)}</span></div>
        </div>
      </SwipeRow>
    })}</div>}
    {threads.length === 0 ? null : <div className="phone-note">Swipe left to delete a conversation.</div>}
    {deleting === undefined ? null : <Menu anchor={new DOMRect()} title={`Delete "${threadName(deleting)}"?`} choices={[{ value: 'delete', label: 'Delete', says: deleting.id === MANAGER_MAIN_THREAD ? 'Its history is deleted and a new empty GeckIt conversation is opened' : 'Its history is deleted. Workers it tracked report to GeckIt', danger: true }]} onPick={() => remove(deleting)} onClose={() => setDeleting(undefined)} />}
  </>
}
