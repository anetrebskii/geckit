import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Tips } from '../ui/Tips'
import { Panel } from './Panel'

// Only macOS draws its window buttons over the page, so only there do the heads leave room for them.
if (window.geckit.platform !== 'darwin') document.documentElement.classList.add('framed')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Panel />
    <Tips />
  </StrictMode>,
)
