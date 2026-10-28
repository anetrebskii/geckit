import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Bubble } from './Bubble'
import { Gecko } from './Gecko'
import { Ring } from './Ring'

// The gecko's bubble and its menu are the same page in windows of their own: the bubble told the side the gecko is on.
const asked = new URLSearchParams(location.search)
const side = asked.get('bubble')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {side === 'left' || side === 'right' ? <Bubble side={side} /> : asked.has('ring') ? <Ring /> : <Gecko />}
  </StrictMode>,
)
