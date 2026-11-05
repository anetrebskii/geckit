import { createRoot } from 'react-dom/client'
import { Servers } from '../../../src/renderer/src/remote/Servers'
import '../../../src/renderer/src/styles.css'
const response = await fetch('http://127.0.0.1:47932/invitation')
const invitation = await response.json() as { readonly link: string }
createRoot(document.getElementById('root') as HTMLElement).render(<Servers invitation={invitation.link} onClose={() => { location.reload() }} />)
