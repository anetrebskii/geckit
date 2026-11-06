import { createRoot } from 'react-dom/client'
import type { ViewFrame, ViewInput } from '../../shared/api'
import { LiveView } from './chat/LiveView'
import type { LiveViewApi } from './chat/LiveView'
import './styles.css'

const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'

const page = { url: 'https://github.com/login', typed: '', focused: false, clicks: 0 }
const canvas = document.createElement('canvas')
canvas.width = 1280
canvas.height = 800
const draw = (): string => {
  const ink = canvas.getContext('2d') as CanvasRenderingContext2D
  ink.fillStyle = '#f6f8fa'; ink.fillRect(0, 0, 1280, 800)
  ink.fillStyle = '#1f2328'; ink.font = '600 28px sans-serif'; ink.textAlign = 'center'
  ink.fillText('Sign in to GitHub', 640, 200)
  ink.fillStyle = '#ffffff'; ink.fillRect(500, 240, 280, 260); ink.strokeStyle = '#d0d7de'; ink.strokeRect(500, 240, 280, 260)
  ink.textAlign = 'left'; ink.font = '15px sans-serif'; ink.fillStyle = '#1f2328'
  ink.fillText('Username or email address', 520, 280)
  ink.strokeStyle = page.focused ? '#0969da' : '#d0d7de'; ink.lineWidth = page.focused ? 2 : 1; ink.strokeRect(520, 292, 240, 34)
  ink.fillText(page.typed, 528, 315)
  ink.fillText('Password', 520, 360); ink.strokeStyle = '#d0d7de'; ink.lineWidth = 1; ink.strokeRect(520, 372, 240, 34)
  ink.fillStyle = '#1f883d'; ink.fillRect(520, 430, 240, 36); ink.fillStyle = '#ffffff'; ink.textAlign = 'center'; ink.fillText('Sign in', 640, 453)
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? ''
}
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const api: LiveViewApi = {
  start: async () => { await wait(600); if (query.has('fail')) throw new Error('Chrome for Testing did not download: the computer has no network.'); return { width: 1280, height: 800 } },
  frame: async (): Promise<ViewFrame> => ({ jpeg: draw(), width: 1280, height: 800, url: page.url, title: 'Sign in to GitHub' }),
  input: async (_name: string, input: ViewInput) => {
    if (input.type === 'click') page.focused = input.x > 520 && input.x < 760 && input.y > 292 && input.y < 326
    if (input.type === 'text' && page.focused) page.typed += input.text
    if (input.type === 'key' && input.key === 'Backspace' && page.focused) page.typed = page.typed.slice(0, -1)
    if (input.type === 'go') page.url = input.url
  },
  end: async () => undefined,
}
const root = createRoot(document.getElementById('root') as HTMLElement)
const show = (): void => root.render(<LiveView name="github-work" {...(query.has('local') ? {} : { computer: 'linux-box' })} api={api} onClose={() => { root.render(<button type="button" onClick={show}>Open again</button>) }} />)
show()
