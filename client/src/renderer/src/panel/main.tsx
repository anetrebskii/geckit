import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Tips } from '../ui/Tips'
import { Panel } from './Panel'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Panel />
    <Tips />
  </StrictMode>,
)
