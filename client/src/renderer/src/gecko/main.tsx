import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Gecko } from './Gecko'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Gecko />
  </StrictMode>,
)
