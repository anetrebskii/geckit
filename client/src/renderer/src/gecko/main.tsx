import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Gecko } from './Gecko'
import { Ring } from './Ring'

// The gecko's menu is the same page in a window of its own.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{new URLSearchParams(location.search).has('ring') ? <Ring /> : <Gecko />}</StrictMode>,
)
