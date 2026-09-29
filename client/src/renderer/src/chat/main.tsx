import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { watchWindowErrors } from '../errors'
import { Tips } from '../ui/Tips'
import { Chat } from './Chat'

// Only macOS draws its window buttons over the page, so only there do the heads leave room for them.
if (window.geckit.platform !== 'darwin') document.documentElement.classList.add('framed')

watchWindowErrors()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Chat />
    <Tips />
  </StrictMode>,
)
