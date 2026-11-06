import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { watchWindowErrors } from '../errors'
import { Tips } from '../ui/Tips'
import { Chat } from './Chat'

// Remote workspaces inherit the client window's inset; only local macOS windows reserve room for overlay buttons here.
if (!document.documentElement.classList.contains('remote-workspace-page') && window.geckit.platform !== 'darwin') document.documentElement.classList.add('framed')

watchWindowErrors()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Chat />
    <Tips />
  </StrictMode>,
)
