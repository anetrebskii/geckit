import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Tips } from '../ui/Tips'
import { Chat } from './Chat'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Chat />
    <Tips />
  </StrictMode>,
)
