import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ViewFrame, ViewInput } from '../../../shared/api'
import { addressOf, TAB_HANDOFF_KEYS } from '../../../shared/live-view'
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
  readonly handoff?: boolean
  readonly display?: HTMLCanvasElement
  readonly video?: HTMLVideoElement
  readonly onClose: () => void
}

type KeyboardViewport = Readonly<Pick<VisualViewport, 'height' | 'offsetTop'>> & { readonly inset: number }

const revealOffset = (start: number, end: number, min: number, max: number): number =>
  Math.min(0, start - min) || Math.max(0, end - max)

const PAINT = /^rgba?\([\d.,\s%/]+\)$/
const phone = (): boolean => document.documentElement.classList.contains('phone')
export const tint = (name: string): string => `var(--project-${[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 8})`
export function BrowserOpening(): React.JSX.Element {
  return <div className="browser-opening" role="status">
    <span className="browser-opening-icon" aria-hidden="true"><Icon name="globe" size={24} /></span>
    <p>Opening the browser tab…</p>
  </div>
}

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
export function LiveView({ name, api, computer, token, title = `Sign in: geckit:${name}`, handoff = false, display, video, onClose }: LiveViewProps): React.JSX.Element {
  const [state, setState] = useState<'opening' | 'live' | 'failed'>('opening')
  const [problem, setProblem] = useState('')
  const [frame, setFrame] = useState<ViewFrame>()
  const [draft, setDraft] = useState<string>()
  const [tries, setTries] = useState(0)
  const [typing, setTyping] = useState(false)
  const [keyboardViewport, setKeyboardViewport] = useState<KeyboardViewport>()
  const keyboard = typing ? keyboardViewport : undefined
  const [tap, setTap] = useState<{ readonly id: number; readonly x: number; readonly y: number }>()
  const tapId = useRef(0)
  const keys = useRef<HTMLTextAreaElement>(null)
  const sheet = useRef<HTMLElement>(null)
  useEffect(() => { sheet.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    const viewport = window.visualViewport
    if (!handoff || viewport === null) return
    const fit = (): void => {
      const height = Math.round(viewport.height)
      const offsetTop = Math.round(viewport.offsetTop)
      const inset = Math.max(window.innerHeight, document.documentElement.clientHeight) - height
      setKeyboardViewport((current) => {
        if (!phone() || viewport.scale !== 1 || inset <= 1) return undefined
        return current?.height === height && current.offsetTop === offsetTop && current.inset === inset ? current : { height, offsetTop, inset }
      })
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => { viewport.removeEventListener('resize', fit); viewport.removeEventListener('scroll', fit) }
  }, [handoff])
  const soon = useRef<() => void>(() => undefined)
  const wheel = useRef<Extract<ViewInput, { type: 'wheel' }>>(undefined)
  const wheelRunning = useRef(false)
  const calls = useRef(api)
  useEffect(() => { calls.current = api })
  const send = useCallback((input: ViewInput): void => {
    if (handoff && input.type === 'wheel') {
      wheel.current = { ...input, dy: input.dy + (wheel.current?.dy ?? 0) }
      if (wheelRunning.current) return
      wheelRunning.current = true
      void (async () => {
        try {
          while (wheel.current !== undefined) {
            const next = wheel.current
            wheel.current = undefined
            const sent = calls.current.input(name, next)
            soon.current()
            await sent
          }
        } catch { wheel.current = undefined }
        finally { wheelRunning.current = false }
      })()
      return
    }
    const sent = calls.current.input(name, input)
    if (handoff) soon.current()
    void sent.then(() => { if (!handoff) soon.current() }, (error: Error) => setProblem(error.message))
  }, [handoff, name])
  const centered = useRef(false)
  const pictureSlot = useRef<HTMLDivElement>(null)
  const centerPicture = useCallback((picture: Element): void => {
    const screen = picture.closest('.live-view-screen')
    if (phone() && screen !== null && !centered.current) { centered.current = true; screen.scrollLeft = (screen.scrollWidth - screen.clientWidth) / 2 }
  }, [])
  const hasPicture = frame !== undefined && (!handoff || state !== 'failed')
  useLayoutEffect(() => {
    const slot = pictureSlot.current
    if (!hasPicture || display === undefined || slot === null) return
    slot.append(display)
    if (video !== undefined) slot.append(video)
    centerPicture(slot)
    return () => { display.remove(); video?.remove() }
  }, [centerPicture, display, hasPicture, video])
  const latestFrame = useRef(frame)
  useEffect(() => { latestFrame.current = frame }, [frame])
  const screen = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ readonly w: number; readonly h: number }>()
  const [zoom, setZoom] = useState<number>()
  const anchor = useRef<{ readonly x: number; readonly y: number; readonly fx: number; readonly fy: number }>(undefined)
  const scale = useRef<(width: number, x: number, y: number) => void>(() => undefined)
  const pinch = useRef<{ readonly d: number; readonly width: number }>(undefined)

  useEffect(() => {
    let stopped = false
    let pulling = false
    let refresh = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const pull = async (): Promise<void> => {
      if (stopped) return
      timer = undefined
      pulling = true
      try {
        const next = await calls.current.frame(name)
        if (stopped) return
        setFrame(next)
        setState('live')
      } catch (error) {
        if (stopped) return
        setProblem(error instanceof Error ? error.message : String(error)); setState('failed'); return
      } finally {
        pulling = false
      }
      const delay = refresh ? 60 : 200
      const immediately = refresh && handoff
      refresh = false
      if (immediately) void pull()
      else timer = setTimeout(() => void pull(), delay)
    }
    soon.current = () => {
      if (pulling) { refresh = true; return }
      if (timer === undefined) return
      clearTimeout(timer)
      if (handoff) void pull()
      else timer = setTimeout(() => void pull(), 60)
    }
    void calls.current.start(name, undefined, token).then(() => pull(), (error: Error) => { if (!stopped) { setProblem(error.message); setState('failed') } })
    return () => { stopped = true; if (timer !== undefined) clearTimeout(timer) }
  }, [handoff, name, token, tries])

  useEffect(() => {
    const box = screen.current
    if (box === null || (!handoff && !phone())) return
    const measure = (): void => setRoom({ w: box.clientWidth, h: box.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    let swipe: { readonly x: number; readonly start: number; y: number } | undefined
    const apart = (touches: TouchList): { d: number; x: number; y: number } => {
      const [a, b] = [touches[0] as Touch, touches[1] as Touch]
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
    }
    const start = (event: TouchEvent): void => {
      if (handoff && event.touches.length === 1) {
        const finger = event.touches[0]
        if (finger !== undefined) swipe = { x: finger.clientX, start: finger.clientY, y: finger.clientY }
      } else swipe = undefined
      if (event.touches.length !== 2) return
      event.preventDefault()
      const page = box.querySelector('.live-view-page')
      if (page !== null) pinch.current = { d: apart(event.touches).d, width: page.getBoundingClientRect().width }
    }
    const move = (event: TouchEvent): void => {
      const from = pinch.current
      if (handoff && swipe !== undefined && event.touches.length === 1) {
        const finger = event.touches[0]
        const picture = box.querySelector('.live-view-picture')?.getBoundingClientRect()
        const painted = latestFrame.current
        if (finger === undefined || picture === undefined || painted === undefined || Math.abs(finger.clientY - swipe.start) <= Math.max(6, Math.abs(finger.clientX - swipe.x))) return
        event.preventDefault()
        const dy = swipe.y - finger.clientY
        swipe.y = finger.clientY
        const before = box.scrollTop
        box.scrollTop += dy
        const remaining = Math.round((dy - (box.scrollTop - before)) * (painted.height / picture.height))
        const x = Math.round((finger.clientX - picture.left) * (painted.width / picture.width))
        const y = Math.round((finger.clientY - picture.top) * (painted.height / picture.height))
        if (remaining !== 0 && x >= 0 && x < painted.width && y >= 0 && y < painted.height) {
          send({ type: 'wheel', x, y, dy: remaining })
        }
        return
      }
      if (from === undefined || event.touches.length !== 2) return
      event.preventDefault()
      const now = apart(event.touches)
      scale.current((from.width * now.d) / from.d, now.x, now.y)
    }
    const end = (event: TouchEvent): void => { if (event.touches.length < 2) pinch.current = undefined; if (event.touches.length === 0) swipe = undefined }
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
  }, [handoff, send])
  const ratio = frame === undefined ? 800 / 1280 : frame.height / frame.width
  const fill = room === undefined ? undefined : (room.h + (keyboard?.inset ?? 0)) / ratio
  const least = room === undefined || fill === undefined ? 0 : Math.min(room.w, fill)
  const most = room === undefined || fill === undefined ? 0 : Math.max(room.w, fill) * 3
  const width = zoom ?? (handoff && room !== undefined ? least : fill)
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
  const caretX = frame?.caret?.x
  const caretY = frame?.caret?.y
  const caretHeight = frame?.caret?.height ?? 0
  const fieldX = frame?.focusedField?.x ?? caretX
  const fieldY = frame?.focusedField?.y ?? caretY
  const fieldWidth = frame?.focusedField?.width ?? 0
  const fieldHeight = frame?.focusedField?.height ?? caretHeight
  const frameWidth = frame?.width
  const frameHeight = frame?.height
  useLayoutEffect(() => {
    const box = screen.current
    const picture = pictureSlot.current
    if (keyboard === undefined || !typing || box === null || picture === null || fieldX === undefined || fieldY === undefined || !frameWidth || !frameHeight) return
    const area = box.getBoundingClientRect()
    const page = picture.getBoundingClientRect()
    const xScale = page.width / frameWidth
    const yScale = page.height / frameHeight
    const xGap = Math.min(8, area.width / 4)
    const yGap = Math.min(8, area.height / 4)
    const wholeWidth = fieldWidth * xScale <= area.width - 2 * xGap
    const wholeHeight = fieldHeight * yScale <= area.height - 2 * yGap
    const left = page.left + (wholeWidth ? fieldX : caretX ?? fieldX) * xScale
    const top = page.top + (wholeHeight ? fieldY : caretY ?? fieldY) * yScale
    const right = left + (wholeWidth ? fieldWidth * xScale : 0)
    const bottom = top + (wholeHeight ? fieldHeight : caretHeight) * yScale
    box.scrollLeft += revealOffset(left, right, area.left + xGap, area.right - xGap)
    box.scrollTop += revealOffset(top, bottom, area.top + yGap, area.bottom - yGap)
  }, [keyboard, typing, width, room?.h, fieldX, fieldY, fieldWidth, fieldHeight, caretX, caretY, caretHeight, frameWidth, frameHeight])
  const step = (by: number): void => {
    const box = screen.current?.getBoundingClientRect()
    if (box !== undefined && width !== undefined) scaleTo(width * by, box.left + box.width / 2, box.top + Math.min(box.height, width * ratio) / 2)
  }

  const shown = frame === undefined || frame.url === 'about:blank' ? '' : frame.url
  const address = parts(shown)
  const where = computer ?? 'this computer'
  const status = state === 'opening' ? `Opening on ${where}` : state === 'live' ? `Live on ${where}` : `Not connected to ${where}`
  const done = (): void => { void calls.current.end(name).catch(() => undefined); onClose() }
  const retry = (): void => { setProblem(''); setState('opening'); setTries((one) => one + 1) }
  const at = (event: React.MouseEvent<Element>): { x: number; y: number } | undefined => {
    if (frame === undefined) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    return { x: Math.round(((event.clientX - box.left) / box.width) * frame.width), y: Math.round(((event.clientY - box.top) / box.height) * frame.height) }
  }
  const picture = {
    className: state === 'live' ? 'live-view-picture' : 'live-view-picture dim',
    width: frame?.width,
    height: frame?.height,
    onClick: (event: React.MouseEvent<Element>): void => {
      const point = at(event)
      if (point !== undefined) {
        if (handoff && state === 'live' && frame !== undefined) setTap({ id: ++tapId.current, x: (point.x / frame.width) * 100, y: (point.y / frame.height) * 100 })
        send({ type: 'click', ...point })
      }
      const field = point === undefined || frame?.fields === undefined || frame.fields.some((one) => point.x >= one.x && point.x <= one.x + one.width && point.y >= one.y && point.y <= one.y + one.height)
      if (!phone() || field) keys.current?.focus({ preventScroll: true })
      else keys.current?.blur()
    },
    onWheel: (event: React.WheelEvent<Element>): void => { const point = at(event); if (point !== undefined) send({ type: 'wheel', ...point, dy: Math.round(event.deltaY) }) },
  }

  return createPortal(
    <div className="dialog-scrim live-view-scrim" style={keyboard === undefined ? undefined : { top: keyboard.offsetTop, height: keyboard.height, bottom: 'auto' }}>
      <section ref={sheet} tabIndex={-1} className={`live-view ${state}${handoff ? ' handoff' : ''}`} style={keyboard === undefined ? undefined : { height: '100%' }} role="dialog" aria-label={title} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && event.target !== keys.current) { event.preventDefault(); done() } }}>
        <header className="live-view-bar">
          <div className="live-view-who">
            <span className="live-view-badge" style={{ background: tint(name) }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
            <span className="live-view-who-lines">
              <strong><span className="live-view-prefix">geckit:</span>{name}</strong>
              <small role="status" title={`You see a picture of the browser on ${where}. What you type goes into it directly, and its sign-ins stay there.`}><span className="live-view-dot" aria-hidden="true" />{status}</small>
            </span>
          </div>
          <form className="live-view-address" onSubmit={(event) => { event.preventDefault(); const url = addressOf(draft ?? ''); setDraft(undefined); if (url !== '') send({ type: 'go', url }); keys.current?.focus({ preventScroll: true }) }}>
            {handoff ? null : <button type="button" className="live-view-tool" aria-label="Back" title="Back" disabled={state !== 'live'} onClick={() => send({ type: 'back' })}><Icon name="left" size={phone() ? 22 : 16} /></button>}
            <label className={`live-view-field${draft === undefined ? '' : ' editing'}`}>
              <span className={`live-view-scheme${address.secure ? ' secure' : ''}`} aria-hidden="true"><Icon name={address.secure ? 'check' : 'globe'} size={phone() ? 14 : 12} /></span>
              <input type="text" inputMode="url" enterKeyHint="go" aria-label="Address" placeholder={!handoff && state === 'live' ? 'Search or enter address' : ''} value={draft ?? shown} readOnly={handoff} tabIndex={handoff ? -1 : undefined} disabled={state !== 'live'} autoCapitalize="off" autoCorrect="off" spellCheck={false} onFocus={(event) => { if (handoff) return; setDraft(shown); const field = event.currentTarget; requestAnimationFrame(() => field.select()) }} onBlur={() => setDraft(undefined)} onChange={(event) => setDraft(event.target.value)} />
              {draft !== undefined || shown === '' ? null : <span className="live-view-url" aria-hidden="true"><b>{address.host}</b>{address.rest}</span>}
            </label>
            {phone() ? <button type="button" className={`live-view-tool${typing ? ' on' : ''}`} aria-label={typing ? 'Hide keyboard' : 'Keyboard'} aria-pressed={typing} disabled={state !== 'live'} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (typing) keys.current?.blur(); else keys.current?.focus({ preventScroll: true }) }}><Icon name="keyboard" size={20} /></button> : null}
          </form>
          <button type="button" className="live-view-done" onClick={done}>Done</button>
        </header>
        <div className="live-view-stage">
          {state === 'opening' && !handoff ? <span className="live-view-progress" aria-hidden="true" /> : null}
          <div ref={screen} className="live-view-screen">
            {state === 'opening' && frame === undefined ? handoff ? <BrowserOpening /> : <div className="live-view-note"><span className="live-view-badge large" style={{ background: tint(name) }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span><p><span className="spinner-turn"><Icon name="spinner" size={14} /></span>Opening geckit:{name}…</p></div> : null}
            {state === 'failed' ? (
              <div className="live-view-note" role="alert">
                <div className="live-view-card">
                  <strong>{handoff ? 'This browser session ended.' : 'The browser is not showing'}</strong>
                  <p>{problem}</p>
                  <span className="live-view-actions"><button type="button" className="live-view-button" onClick={handoff ? done : onClose}>Close</button>{handoff || token !== undefined ? null : <button type="button" className="live-view-button primary" onClick={retry}>Try again</button>}</span>
                </div>
              </div>
            ) : null}
            {frame === undefined || (handoff && state === 'failed') ? null : (
              <div className="live-view-page" style={phone() && width !== undefined ? { width } : handoff ? { maxWidth: `calc(100cqh * ${frame.width / frame.height})` } : undefined}>
                {display !== undefined ? (
                  <div ref={pictureSlot} className={picture.className} onClick={picture.onClick} onWheel={picture.onWheel} role="img" aria-label={frame.title === '' ? `geckit:${name}` : frame.title} />
                ) : <img
                  {...picture}
                  src={`data:image/jpeg;base64,${frame.jpeg}`}
                  alt={frame.title === '' ? `geckit:${name}` : frame.title}
                  draggable={false}
                  onLoad={(event) => centerPicture(event.currentTarget)}
                />}
                {tap === undefined || state !== 'live' ? null : <span key={tap.id} className="live-view-tap" aria-hidden="true" style={{ left: `${tap.x}%`, top: `${tap.y}%` }} onAnimationEnd={() => setTap((current) => current?.id === tap.id ? undefined : current)} />}
                {typing && state === 'live' && frame.caret !== undefined ? <span
                  key={`${frame.caret.x},${frame.caret.y}`}
                  className="live-view-caret"
                  aria-hidden="true"
                  style={{ left: `${(frame.caret.x / frame.width) * 100}%`, top: `${(frame.caret.y / frame.height) * 100}%`, height: `${(frame.caret.height / frame.height) * 100}%`, ...(frame.caret.color !== undefined && PAINT.test(frame.caret.color) ? { background: frame.caret.color } : {}) }}
                /> : null}
                {state === 'live' && frame.pointer !== undefined ? <svg
                  className="live-view-pointer"
                  viewBox="0 0 20 24"
                  aria-hidden="true"
                  style={{ left: `${(frame.pointer.x / frame.width) * 100}%`, top: `${(frame.pointer.y / frame.height) * 100}%` }}
                ><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z" /></svg> : null}
              </div>
            )}
          </div>
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
            onKeyDown={(event) => { if (TAB_HANDOFF_KEYS.has(event.key)) { event.preventDefault(); send({ type: 'key', key: event.key }) } }}
          />
          {phone() && state === 'live' && width !== undefined ? (
            <div className="live-view-zoom" role="group" aria-label="Zoom" onMouseDown={typing && handoff ? (event) => event.preventDefault() : undefined}>
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
