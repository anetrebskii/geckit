import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Voice } from './Voice'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Voice />
  </StrictMode>,
)
