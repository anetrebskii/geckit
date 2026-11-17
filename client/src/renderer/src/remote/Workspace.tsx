import { useEffect, useRef, useState } from 'react'
import type { RemoteServer } from '../../../shared/remote/protocol'
import type { connectRemote } from './client'
import type { RemoteComputer } from './Computer'
import { ConnectProgress } from './ConnectProgress'
import { computerName } from './Computer'
import type { ConnectSteps } from './client'

export type WorkspaceConnection = Pick<ReturnType<typeof connectRemote>, 'call' | 'on'> & Partial<Pick<ReturnType<typeof connectRemote>, 'onReconnected'>>
export interface WorkspaceMount {
  readonly connection: WorkspaceConnection
  readonly server: RemoteServer
  readonly phone: boolean
  readonly onClose?: () => void
  readonly source?: RemoteComputer
}

declare global {
  interface Window {
    mountRemoteWorkspace?: (mount: WorkspaceMount) => Promise<void>
  }
}

type WorkspaceProps = Omit<WorkspaceMount, 'phone'> & { readonly steps: ConnectSteps; readonly quick?: boolean; readonly onCancel?: () => void }

export function Workspace({ connection, server, onClose, onCancel, source, steps, quick = false }: WorkspaceProps): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const [trouble, setTrouble] = useState('')
  const [mounted, setMounted] = useState(false)
  const [late, setLate] = useState(false)
  // The board shows once the conversation list has come, or a minute after the workspace started without it.
  const [shown, setShown] = useState(false)
  const listed = steps.some((one) => one.stage === 'ready')
  // Opened on what was kept, it shows that at once rather than the steps of the link being made.
  if (mounted && !shown && (late || listed || quick)) setShown(true)
  const opening = !shown
  // Opened on what was kept, nothing is drawn until the workspace mounts: past a moment, say that it is opening rather than leave the window blank.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!quick || mounted) return
    const wait = setTimeout(() => setSlow(true), 800)
    return () => clearTimeout(wait)
  }, [quick, mounted])
  useEffect(() => {
    if (!mounted) return
    const wait = setTimeout(() => setLate(true), 60_000)
    return () => clearTimeout(wait)
  }, [mounted])
  useEffect(() => { if (source !== undefined) frame.current?.contentWindow?.updateRemoteComputer?.(source) }, [source])
  const cancel = onCancel === undefined ? null : <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
  return <section className="remote-full-workspace" aria-label={`${server.name} workspace`}>
    {trouble === '' ? null : <p className="remote-feedback failed" role="alert">{trouble}</p>}
    {opening && trouble === '' && !quick ? <div className="remote-opening" role="status"><h2>Opening {source?.server.name ?? server.name}</h2><ConnectProgress name={source?.server.name ?? server.name} steps={steps} />{cancel}</div> : null}
    {opening && trouble === '' && quick && slow ? <div className="remote-opening quick" role="status"><span className="remote-opening-line"><span className="phone-spin" aria-hidden="true" /><span>Opening {computerName(source?.server.name ?? server.name)}…</span></span>{cancel}</div> : null}
    <iframe
      ref={frame}
      className={opening ? 'opening' : undefined}
      aria-label={`${server.name} - tasks and conversations`}
      src={new URL(import.meta.env.DEV ? '/remote-workspace.html' : './remote-workspace.html', window.location.href).href}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups"
      allow="clipboard-read; clipboard-write; microphone"
      onLoad={() => {
        const mount = frame.current?.contentWindow?.mountRemoteWorkspace
        if (mount === undefined) { setTrouble('Could not open the server workspace. Reopen Servers to try again.'); return }
        void mount({ connection, server, phone: document.documentElement.classList.contains('phone'), ...(onClose === undefined ? {} : { onClose }), ...(source === undefined ? {} : { source }) }).then(() => setMounted(true), (error: Error) => setTrouble(error.message))
      }}
    />
  </section>
}
