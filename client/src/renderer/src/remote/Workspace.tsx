import { useEffect, useRef, useState } from 'react'
import type { RemoteServer } from '../../../shared/remote/protocol'
import type { connectRemote } from './client'
import type { RemoteComputer } from './Computer'

export type WorkspaceConnection = Pick<ReturnType<typeof connectRemote>, 'call' | 'on'>
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

type WorkspaceProps = Omit<WorkspaceMount, 'phone'>

export function Workspace({ connection, server, onClose, source }: WorkspaceProps): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const [trouble, setTrouble] = useState('')
  useEffect(() => { if (source !== undefined) frame.current?.contentWindow?.updateRemoteComputer?.(source) }, [source])
  return <section className="remote-full-workspace" aria-label={`${server.name} workspace`}>
    {trouble === '' ? null : <p className="remote-feedback failed" role="alert">{trouble}</p>}
    <iframe
      ref={frame}
      aria-label={`${server.name} - tasks and conversations`}
      src={new URL(import.meta.env.DEV ? '/remote-workspace.html' : './remote-workspace.html', window.location.href).href}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups"
      allow="clipboard-read; clipboard-write; microphone"
      onLoad={() => {
        const mount = frame.current?.contentWindow?.mountRemoteWorkspace
        if (mount === undefined) { setTrouble('Could not open the server workspace. Reopen Servers to try again.'); return }
        void mount({ connection, server, phone: document.documentElement.classList.contains('phone'), ...(onClose === undefined ? {} : { onClose }), ...(source === undefined ? {} : { source }) }).catch((error: Error) => setTrouble(error.message))
      }}
    />
  </section>
}
