import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Bubble } from './Bubble'
import { Gecko } from './Gecko'

// The gecko's bubble is the same page in a window of its own, told the side the gecko is on.
const side = new URLSearchParams(location.search).get('bubble')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {side === 'left' || side === 'right' ? <Bubble side={side} /> : <Gecko />}
  </StrictMode>,
)
