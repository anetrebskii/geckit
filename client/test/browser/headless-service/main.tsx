import '../../../src/preload'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/renderer/src/styles.css'

const { Chat } = await import('../../../src/renderer/src/chat/Chat')
document.documentElement.classList.add('framed')
const root = document.getElementById('root')
if (root === null) throw new Error('Chat root is missing.')
createRoot(root).render(createElement(Chat))
