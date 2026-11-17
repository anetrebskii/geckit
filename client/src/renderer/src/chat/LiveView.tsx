import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ViewFrame, ViewInput } from '../../../shared/api'
import { addressOf } from '../../../shared/live-view'
import { Icon } from '../ui/Icon'

export interface LiveViewApi {
  readonly start: (name: string, url?: string, token?: string) => Promise<{ readonly width: number; readonly height: number }>
  readonly frame: (name: string) => Promise<ViewFrame>
  readonly input: (name: string, input: ViewInput) => Promise<void>
  readonly end: (name: string) => Promise<void>
}

interface LiveViewProps {
  readonly name: string
  readonly api: LiveViewApi
  readonly computer?: string
  readonly token?: string
  readonly title?: string
  readonly onClose: () => void
}

const KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])
const PAINT = /^rgba?\([\d.,\s%/]+\)$/
const phone = (): boolean => document.documentElement.classList.contains('phone')
export const tint = (name: string): string => `var(--project-${[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 8})`
const parts = (url: string): { readonly secure: boolean; readonly host: string; readonly rest: string } => {
  try {
    const parsed = new URL(url)
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`
    return { secure: parsed.protocol === 'https:', host: parsed.host.replace(/^www\./, ''), rest }
  } catch {
    return { secure: false, host: url, rest: '' }
  }
}

/** A test browser shown live, so the person signs in to a site themselves. */
export function LiveView({ name, api, computer, token, title = `Sign in: geckit:${name}`, onClose }: LiveViewProps): React.JSX.Element {
  const [state, setState] = useState<'opening' | 'live' | 'failed'>('opening')
  const [problem, setProblem] = useState('')
  const [frame, setFrame] = useState<ViewFrame>()
  const [draft, setDraft] = useState<string>()
  const [tries, setTries] = useState(0)
  const [typing, setTyping] = useState(false)
  const keys = useRef<HTMLTextAreaElement>(null)
  const sheet = useRef<HTMLElement>(null)
  useEffect(() => { sheet.current?.focus({ preventScroll: true }) }, [])
  const soon = useRef<() => void>(() => undefined)
  const used = useRef(false)
  const centered = useRef(false)
  const calls = useRef(api)
  useEffect(() => { calls.current = api })
  const screen = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ readonly w: number; readonly h: number }>()
  const [zoom, setZoom] = useState<number>()
  const anchor = useRef<{ readonly x: number; readonly y: number; readonly fx: number; readonly fy: number }>(undefined)
  const scale = useRef<(width: number, x: number, y: number) => void>(() => undefined)
  const pinch = useRef<{ readonly d: number; readonly width: number }>(undefined)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const pull = async (): Promise<void> => {
      if (stopped) return
      try {
        const next = await calls.current.frame(name)
        if (stopped) return
        setFrame(next)
        setState('live')
      } catch (error) {
        if (stopped) return
        setProblem(error instanceof Error ? error.message : String(error)); setState('failed'); return
      }
      timer = setTimeout(() => void pull(), 200)
    }
    soon.current = () => { if (timer !== undefined) { clearTimeout(timer); timer = setTimeout(() => void pull(), 60) } }
    const once = used.current ? undefined : token
    used.current = true
    void calls.current.start(name, undefined, once).then(() => pull(), (error: Error) => { if (!stopped) { setProblem(error.message); setState('failed') } })
    return () => { stopped = true; if (timer !== undefined) clearTimeout(timer) }
  }, [name, token, tries])

  useEffect(() => {
    const box = screen.current
    if (box === null || !phone()) return
    const measure = (): void => setRoom({ w: box.clientWidth, h: box.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    const apart = (touches: TouchList): { d: number; x: number; y: number } => {
      const [a, b] = [touches[0] as Touch, touches[1] as Touch]
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
    }
    const start = (event: TouchEvent): void => {
      if (event.touches.length !== 2) return
      event.preventDefault()
      const page = box.querySelector('.live-view-page')
      if (page !== null) pinch.current = { d: apart(event.touches).d, width: page.getBoundingClientRect().width }
    }
    const move = (event: TouchEvent): void => {
      const from = pinch.current
      if (from === undefined || event.touches.length !== 2) return
      event.preventDefault()
      const now = apart(event.touches)
      scale.current((from.width * now.d) / from.d, now.x, now.y)
    }
    const end = (event: TouchEvent): void => { if (event.touches.length < 2) pinch.current = undefined }
    box.addEventListener('touchstart', start, { passive: false })
    box.addEventListener('touchmove', move, { passive: false })
    box.addEventListener('touchend', end)
    box.addEventListener('touchcancel', end)
    return () => {
      watch.disconnect()
      box.removeEventListener('touchstart', start)
      box.removeEventListener('touchmove', move)
      box.removeEventListener('touchend', end)
      box.removeEventListener('touchcancel', end)
    }
  }, [])
  const ratio = frame === undefined ? 800 / 1280 : frame.height / frame.width
  const fill = room === undefined ? undefined : room.h / ratio
  const least = room === undefined || fill === undefined ? 0 : Math.min(room.w, fill)
  const most = room === undefined || fill === undefined ? 0 : Math.max(room.w, fill) * 3
  const width = zoom ?? fill
  const scaleTo = (next: number, x: number, y: number): void => {
    const page = screen.current?.querySelector('.live-view-page')
    if (page === null || page === undefined || width === undefined) return
    const box = page.getBoundingClientRect()
    anchor.current = { x, y, fx: (x - box.left) / box.width, fy: (y - box.top) / box.height }
    setZoom(Math.min(most, Math.max(least, next)))
  }
  useEffect(() => { scale.current = scaleTo })
  useLayoutEffect(() => {
    const point = anchor.current
    const box = screen.current
    const page = box?.querySelector('.live-view-page')
    if (point === undefined || box === null || box === undefined || page === null || page === undefined) return
    anchor.current = undefined
    const now = page.getBoundingClientRect()
    box.scrollLeft += now.left - (point.x - point.fx * now.width)
    box.scrollTop += now.top - (point.y - point.fy * now.height)
  }, [width])
  const step = (by: number): void => {
    const box = screen.current?.getBoundingClientRect()
    if (box !== undefined && width !== undefined) scaleTo(width * by, box.left + box.width / 2, box.top + box.height / 2)
  }

  const shown = frame === undefined || frame.url === 'about:blank' ? '' : frame.url
  const address = parts(shown)
  const where = computer ?? 'this computer'
  const status = state === 'opening' ? `Opening on ${where}` : state === 'live' ? `Live on ${where}` : `Not connected to ${where}`
  const send = useCallback((input: ViewInput): void => { void calls.current.input(name, input).then(() => soon.current(), (error: Error) => setProblem(error.message)) }, [name])
  const done = (): void => { void calls.current.end(name).catch(() => undefined); onClose() }
  const retry = (): void => { setProblem(''); setState('opening'); setTries((one) => one + 1) }
  const at = (event: React.MouseEvent<HTMLImageElement> | React.WheelEvent<HTMLImageElement>): { x: number; y: number } | undefined => {
    if (frame === undefined) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    return { x: Math.round(((event.clientX - box.left) / box.width) * frame.width), y: Math.round(((event.clientY - box.top) / box.height) * frame.height) }
  }

  return createPortal(
    <div className="dialog-scrim live-view-scrim">
      <section ref={sheet} tabIndex={-1} className={`live-view ${state}`} role="dialog" aria-label={title} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && event.target !== keys.current) { event.preventDefault(); done() } }}>
        <header className="live-view-bar">
          <div className="live-view-who">
            <span className="live-view-badge" style={{ background: tint(name) }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
            <span className="live-view-who-lines">
              <strong><span className="live-view-prefix">geckit:</span>{name}</strong>
              <small role="status" title={`You see a picture of the browser on ${where}. What you type goes into it directly, and its sign-ins stay there.`}><span className="live-view-dot" aria-hidden="true" />{status}</small>
            </span>
          </div>
          <form className="live-view-address" onSubmit={(event) => { event.preventDefault(); const url = addressOf(draft ?? ''); setDraft(undefined); if (url !== '') send({ type: 'go', url }); keys.current?.focus({ preventScroll: true }) }}>
            <button type="button" className="live-view-tool" aria-label="Back" title="Back" disabled={state !== 'live'} onClick={() => send({ type: 'back' })}><Icon name="left" size={phone() ? 22 : 16} /></button>
            <label className={`live-view-field${draft === undefined ? '' : ' editing'}`}>
              <span className={`live-view-scheme${address.secure ? ' secure' : ''}`} aria-hidden="true"><Icon name={address.secure ? 'check' : 'globe'} size={phone() ? 14 : 12} /></span>
              <input type="text" inputMode="url" enterKeyHint="go" aria-label="Address" placeholder={state === 'live' ? 'Search or enter address' : ''} value={draft ?? shown} disabled={state !== 'live'} autoCapitalize="off" autoCorrect="off" spellCheck={false} onFocus={(event) => { setDraft(shown); const field = event.currentTarget; requestAnimationFrame(() => field.select()) }} onBlur={() => setDraft(undefined)} onChange={(event) => setDraft(event.target.value)} />
              {draft !== undefined || shown === '' ? null : <span className="live-view-url" aria-hidden="true"><b>{address.host}</b>{address.rest}</span>}
            </label>
            {phone() ? <button type="button" className={`live-view-tool${typing ? ' on' : ''}`} aria-label={typing ? 'Hide keyboard' : 'Keyboard'} aria-pressed={typing} disabled={state !== 'live'} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (typing) keys.current?.blur(); else keys.current?.focus() }}><Icon name="keyboard" size={20} /></button> : null}
          </form>
          <button type="button" className="live-view-done" onClick={done}>Done</button>
        </header>
        <div className="live-view-stage">
          {state === 'opening' ? <span className="live-view-progress" aria-hidden="true" /> : null}
          <div ref={screen} className="live-view-screen">
            {state === 'opening' && frame === undefined ? <div className="live-view-note"><span className="live-view-badge large" style={{ background: tint(name) }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span><p><span className="spinner-turn"><Icon name="spinner" size={14} /></span>Opening geckit:{name}…</p></div> : null}
            {state === 'failed' ? (
              <div className="live-view-note" role="alert">
                <div className="live-view-card">
                  <strong>The browser is not showing</strong>
                  <p>{problem}</p>
                  <span className="live-view-actions"><button type="button" className="live-view-button" onClick={onClose}>Close</button><button type="button" className="live-view-button primary" onClick={retry}>Try again</button></span>
                </div>
              </div>
            ) : null}
            {frame === undefined ? null : (
              <div className="live-view-page" style={phone() && width !== undefined ? { width } : undefined}>
                <img
                  className={state === 'live' ? 'live-view-picture' : 'live-view-picture dim'}
                  src={`data:image/jpeg;base64,${frame.jpeg}`}
                  alt={frame.title === '' ? `geckit:${name}` : frame.title}
                  width={frame.width}
                  height={frame.height}
                  draggable={false}
                  onLoad={(event) => { const screen = event.currentTarget.closest('.live-view-screen'); if (phone() && screen !== null && !centered.current) { centered.current = true; screen.scrollLeft = (screen.scrollWidth - screen.clientWidth) / 2 } }}
                  onClick={(event) => {
                    const point = at(event)
                    if (point !== undefined) send({ type: 'click', ...point })
                    const field = point === undefined || frame?.fields === undefined || frame.fields.some((one) => point.x >= one.x && point.x <= one.x + one.width && point.y >= one.y && point.y <= one.y + one.height)
                    if (!phone() || field) keys.current?.focus({ preventScroll: true })
                    else keys.current?.blur()
                  }}
                  onWheel={(event) => { const point = at(event); if (point !== undefined) send({ type: 'wheel', ...point, dy: Math.round(event.deltaY) }) }}
                />
                {typing && state === 'live' && frame.caret !== undefined ? <span
                  key={`${frame.caret.x},${frame.caret.y}`}
                  className="live-view-caret"
                  aria-hidden="true"
                  style={{ left: `${(frame.caret.x / frame.width) * 100}%`, top: `${(frame.caret.y / frame.height) * 100}%`, height: `${(frame.caret.height / frame.height) * 100}%`, ...(frame.caret.color !== undefined && PAINT.test(frame.caret.color) ? { background: frame.caret.color } : {}) }}
                /> : null}
              </div>
            )}
            <textarea
              ref={keys}
              className="live-view-keys"
              aria-label="Type into the page"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value=""
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(event) => { const text = event.target.value; if (text !== '') send({ type: 'text', text }) }}
              onKeyDown={(event) => { if (KEYS.has(event.key)) { event.preventDefault(); send({ type: 'key', key: event.key }) } }}
            />
          </div>
          {phone() && state === 'live' && width !== undefined ? (
            <div className="live-view-zoom" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out" disabled={width <= least + 1} onClick={() => step(1 / 1.5)}><Icon name="minus" size={18} /></button>
              <button type="button" aria-label="Zoom in" disabled={width >= most - 1} onClick={() => step(1.5)}><Icon name="plus" size={18} /></button>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
