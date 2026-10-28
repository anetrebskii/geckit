import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Gecko } from './Gecko'

// Behind the panel is the Mac's own glass, so the page draws only the edge and the shine on it.
if (window.geckit.platform === 'darwin') document.documentElement.classList.add('vibrant')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Gecko />
  </StrictMode>,
)
