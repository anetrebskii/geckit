import '../../../src/preload'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MacList } from '../../../src/renderer/src/chat/PhoneBoard'
import { Servers } from '../../../src/renderer/src/remote/Servers'
import type { Macs } from '../../../src/renderer/src/macs'
import '../../../src/renderer/src/styles.css'

function Preview(): React.JSX.Element {
  const [servers, setServers] = useState(false)
  useEffect(() => {
    const open = (): void => setServers(true)
    window.addEventListener('preview-servers', open)
    return () => window.removeEventListener('preview-servers', open)
  }, [])
  return servers ? <Servers onClose={() => setServers(false)} /> : <MacList paired={paired} onChange={() => undefined} onClose={() => undefined} />
}
const paired: ReturnType<Macs['list']> = [{ name: 'Previously paired host', current: true }]
const boundary: Macs = { list: () => paired, switchTo: () => undefined, add: () => undefined, forget: () => undefined, rename: () => undefined, servers: () => window.dispatchEvent(new Event('preview-servers')) }
;(window as { geckitMacs?: Macs }).geckitMacs = boundary
const root = document.getElementById('root')
if (root === null) throw new Error('Missing preview root')
createRoot(root).render(<Preview />)
