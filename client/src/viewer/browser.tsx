import { createRoot } from 'react-dom/client'
import { BrowserOpening, LiveView } from '../renderer/src/chat/LiveView'
import type { LiveViewApi } from '../renderer/src/chat/LiveView'
import { remoteDial } from '../renderer/src/remote/transport'
import { dial } from '../renderer/src/link'
import type { Link } from '../renderer/src/link'
import { readTabHandoff } from '../shared/live-view'
import type { TabHandoffAction, TabHandoffReply } from '../shared/live-view'
import type { ViewFrame } from '../shared/api'
import { SIGNAL } from '../shared/pairing'
import '../renderer/src/styles.css'
import './secret.css'
import './browser.css'

const mount = document.getElementById('browser')
if (mount === null) throw new Error('Browser viewer needs a mount point.')
const root = createRoot(mount)
const compact = matchMedia('(max-width: 760px), (pointer: coarse)')
document.documentElement.classList.toggle('phone', compact.matches)
compact.addEventListener('change', () => document.documentElement.classList.toggle('phone', compact.matches))

const ended = 'This browser session ended. Ask for a new link if you need the tab again.'
const unavailable = 'This browser tab is unavailable. Ask for a new link.'
const done = 'You can close this window. The browser tab stays open.'
const say = (line: string): void => root.render(<main className="secret" role="status"><h1>{line}</h1></main>)
const link = readTabHandoff(location.hash)
if (link !== undefined) history.replaceState(null, '', location.pathname)

async function open(): Promise<void> {
  if (link === undefined) { say(unavailable); return }
  if (Date.now() >= link.expires) { say('This browser link expired. Ask for a new link.'); return }
  root.render(<BrowserOpening />)
  const controller = new AbortController()
  window.addEventListener('pagehide', () => controller.abort(), { once: true })
  try {
    const channel = await remoteDial({ key: link.key, signal: SIGNAL }, controller.signal, undefined, 300)
    if (controller.signal.aborted) { channel.close(); return }
    controller.signal.addEventListener('abort', () => channel.close(), { once: true })
    let sequence = 0
    let closed = false
    let live = false
    let finished = false
    const pending = new Map<number, (reply: TabHandoffReply) => void>()
    channel.onClose(() => {
      closed = true
      for (const [id, answer] of pending) answer({ id, ok: false, error: live ? ended : unavailable })
      if (live && !finished) say(ended)
    })
    channel.onMessage((text) => {
      try {
        const reply = JSON.parse(text) as TabHandoffReply
        pending.get(reply.id)?.(reply)
      } catch { channel.close() }
    })
    const call = (request: TabHandoffAction): Promise<Extract<TabHandoffReply, { ok: true }>> => new Promise((resolve, reject) => {
      if (closed) { reject(new Error(live ? ended : unavailable)); return }
      const id = ++sequence
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(live ? ended : unavailable)); channel.close() }, 20_000)
      pending.set(id, (reply) => {
        clearTimeout(timer)
        pending.delete(id)
        if (reply.ok) resolve(reply)
        else reject(new Error(reply.error))
      })
      channel.send(JSON.stringify({ id, ...request }))
    })
    let started: Awaited<ReturnType<typeof call>>
    try { started = await call({ type: 'open', acceptVideo: true }) } catch (error) { channel.close(); say(error instanceof Error ? error.message : unavailable); return }
    if (typeof started.profile !== 'string') { channel.close(); say(unavailable); return }
    live = true
    let lastFrame: ViewFrame | undefined
    const display = document.createElement('canvas')
    const paint = display.getContext('2d')
    if (paint === null) { channel.close(); say(unavailable); return }
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.setAttribute('aria-hidden', 'true')
    if (started.videoKey !== undefined) {
      let media: Link | undefined
      let stopped = false
      const stop = (): void => {
        if (stopped) return
        stopped = true
        clearTimeout(deadline)
        video.classList.remove('playing')
        video.srcObject = null
        media?.close()
        if (!closed && !finished) void call({ type: 'video-stop' }).catch(() => undefined)
      }
      const deadline = setTimeout(stop, 15_000)
      video.addEventListener('playing', () => {
        if (stopped) return
        clearTimeout(deadline)
        video.classList.add('playing')
      })
      video.addEventListener('error', stop, { once: true })
      channel.onClose(stop)
      controller.signal.addEventListener('abort', stop, { once: true })
      void dial({ key: started.videoKey, signal: SIGNAL }, 15_000).then((link) => {
        if (stopped) { link.close(); return }
        media = link
        link.onClose(stop)
        const stream = link.screen()
        const track = stream?.getVideoTracks()[0]
        if (stream === undefined || track === undefined) { stop(); return }
        track.addEventListener('ended', stop, { once: true })
        video.srcObject = stream
        void video.play().catch(stop)
      }, stop)
    }
    const api: LiveViewApi = {
      start: () => Promise.resolve({ width: 1280, height: 800 }),
      frame: async () => {
        const reply = await call(video.classList.contains('playing')
          ? { type: 'metadata' }
          : { type: 'frame', acceptPatches: true, ...(lastFrame === undefined ? {} : { acceptUnchanged: true }) })
        if (reply.unchanged && lastFrame !== undefined) return lastFrame
        if (reply.frame === undefined) throw new Error(ended)
        const { width, height } = reply.frame
        const png = 'png' in reply.frame ? reply.frame.png : undefined
        const source = reply.patch?.png ?? png ?? ('jpeg' in reply.frame ? reply.frame.jpeg : '')
        if (source !== '') {
          const bytes = Uint8Array.from(atob(source), (byte) => byte.charCodeAt(0))
          const image = await createImageBitmap(new Blob([bytes], { type: png === undefined ? 'image/jpeg' : 'image/png' }))
          if (reply.patch === undefined) {
            if (display.width !== width) display.width = width
            if (display.height !== height) display.height = height
            paint.drawImage(image, 0, 0, width, height)
          } else {
            const { x, y } = reply.patch
            paint.clearRect(x, y, image.width, image.height)
            paint.drawImage(image, x, y)
          }
          image.close()
        }
        const { url, title, caret, fields, focusedField, pointer } = reply.frame
        lastFrame = { width, height, url, title, jpeg: '', ...(caret === undefined ? {} : { caret }), ...(fields === undefined ? {} : { fields }), ...(focusedField === undefined ? {} : { focusedField }), ...(pointer === undefined ? {} : { pointer }) }
        return lastFrame
      },
      input: async (_name, input) => { await call({ type: 'input', input }) },
      end: async () => {
        finished = true
        try {
          await call({ type: 'end' })
        } finally {
          channel.close()
          window.close()
        }
      },
    }
    root.render(<LiveView name={started.profile} api={api} display={display} video={video} handoff computer={started.computer ?? 'the host computer'} title="Browser tab" onClose={() => say(done)} />)
  } catch { if (!controller.signal.aborted) say(unavailable) }
}

void open()
