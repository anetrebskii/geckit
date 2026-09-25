import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../styles.css'
import { Record } from './Record'
import { Voice } from './Voice'

// The window is opened for one thing each time, and it asks which before drawing anything.
void window.geckit.voice
  .mode()
  // A main process from before recording existed has nothing to answer with, and it only dictates.
  .catch(() => 'paste')
  .then((mode) =>
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>{mode === 'record' || mode === 'fill' ? <Record fill={mode === 'fill'} /> : <Voice />}</StrictMode>,
  ),
)
