import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Settings } from '../../../shared/api'
import type { ManagerView } from '../../../shared/manager'
import { useBack } from '../phone-back'
import { phoneCalls } from '../phone-calls'
import { Icon } from '../ui/Icon'
import { EmployeeAvatar } from '../employees/Employees'
import { managerFace } from '../employees/TeamManager'
import { ManagerChat } from './ManagerChat'
import { EdgeBack } from './PhoneKit'
import { MANAGER_CHAT_EVENT } from './manager-chat-open'
import { managerStand } from './manager-label'
import { managerLabel, useManager } from './useManager'

export function ManagerStatus({ settings, onSettings }: { readonly settings: Settings; readonly onSettings: () => void }): React.JSX.Element {
  const view = useManager()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const show = useCallback((): void => { if (view === undefined) return; if (!view.config.enabled && view.session === undefined) onSettings(); else setOpen(true) }, [view, onSettings])
  useEffect(() => { window.addEventListener(MANAGER_CHAT_EVENT, show); return () => window.removeEventListener(MANAGER_CHAT_EVENT, show) }, [show])
  const setup = view !== undefined && !view.config.enabled && view.session === undefined
  return <>
    <button type="button" className="assistant-open manager-status" disabled={view === undefined} aria-haspopup="dialog" aria-expanded={open} title="Chat with Manager" onClick={show}><Icon name="chat" size={12} /><span>{setup ? 'Set up Manager' : 'Manager'}</span>{setup ? null : <span className="manager-status-label">{view === undefined ? 'Loading...' : managerLabel(view)}</span>}</button>
    {!open || view === undefined ? null : <ManagerInspection view={view} settings={settings} onClose={close} onSettings={() => { close(); onSettings() }} />}
  </>
}

function Stand({ view }: { readonly view: ManagerView }): React.JSX.Element {
  const stand = managerStand(view)
  return <span className="manager-stand" data-tone={stand.tone} role="status"><span className="manager-stand-dot" aria-hidden="true" /><span className="manager-stand-text">{stand.short}</span></span>
}

export function ManagerInspection({ view, settings, onClose, onSettings }: { readonly view: ManagerView; readonly settings: Settings; readonly onClose: () => void; readonly onSettings: () => void }): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const before = document.activeElement
    close.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
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
    <header className="manager-inspection-header"><EmployeeAvatar employee={managerFace(settings)} /><h2 id="manager-inspection-title">Manager</h2><Stand view={view} /><button type="button" className="icon-button" aria-label="Manager settings" title="Manager settings" onClick={onSettings}><Icon name="settings" /></button><button ref={close} type="button" className="icon-button" aria-label="Close Manager" onClick={onClose}><Icon name="close" /></button></header>
    <ManagerChat view={view} settings={settings} onSettings={onSettings} />
  </div></div>, document.body)
}

export function ManagerPhone({ settings, onBack, onSettings, back = 'Back' }: { readonly settings: Settings; readonly onBack: () => void; readonly onSettings?: () => void; readonly back?: string }): React.JSX.Element {
  const page = useRef<HTMLElement>(null)
  useBack(onBack, page)
  const view = useManager()
  const [connected, setConnected] = useState(() => phoneCalls()?.connected() ?? true)
  useEffect(() => phoneCalls()?.onConnection(setConnected), [])
  return <section ref={page} className="manager-phone phone-page" aria-label="Manager chat">
    <EdgeBack onBack={onBack} />
    <header className="manager-inspection-header"><button type="button" className="quiet" onClick={onBack}><Icon name="left" size={14} />{back}</button><h2>Manager</h2>{view === undefined ? null : <Stand view={view} />}{onSettings === undefined ? null : <button type="button" className="icon-button" aria-label="Manager settings" onClick={onSettings}><Icon name="settings" /></button>}</header>
    {view === undefined ? <div className="manager-inspection-empty" role="status"><Icon name="spinner" size={20} /><p>{connected ? 'Loading the Manager session...' : 'Computer disconnected. Reconnect to send.'}</p></div> : <ManagerChat view={view} settings={settings} connected={connected} onSettings={onSettings} />}
  </section>
}
