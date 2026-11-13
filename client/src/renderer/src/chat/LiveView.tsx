import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ViewFrame, ViewInput } from '../../../shared/api'
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
const phone = (): boolean => document.documentElement.classList.contains('phone')

/** A test browser shown live, so the person signs in to a site themselves. */
export function LiveView({ name, api, computer, token, title = `Sign in: geckit:${name}`, onClose }: LiveViewProps): React.JSX.Element {
  const [state, setState] = useState<'opening' | 'live' | 'failed'>('opening')
  const [problem, setProblem] = useState('')
  const [frame, setFrame] = useState<ViewFrame>()
  const [draft, setDraft] = useState<string>()
  const [tries, setTries] = useState(0)
  const keys = useRef<HTMLTextAreaElement>(null)
  const soon = useRef<() => void>(() => undefined)
  const used = useRef(false)
  const centered = useRef(false)
  const calls = useRef(api)
  useEffect(() => { calls.current = api })

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

  const shown = frame === undefined || frame.url === 'about:blank' ? '' : frame.url
  const send = useCallback((input: ViewInput): void => { void calls.current.input(name, input).then(() => soon.current(), (error: Error) => setProblem(error.message)) }, [name])
  const done = (): void => { void calls.current.end(name).catch(() => undefined); onClose() }
  const at = (event: React.MouseEvent<HTMLImageElement> | React.WheelEvent<HTMLImageElement>): { x: number; y: number } | undefined => {
    if (frame === undefined) return undefined
    const box = event.currentTarget.getBoundingClientRect()
    return { x: Math.round(((event.clientX - box.left) / box.width) * frame.width), y: Math.round(((event.clientY - box.top) / box.height) * frame.height) }
  }

  return createPortal(
    <div className="dialog-scrim live-view-scrim">
      <section className="live-view" role="dialog" aria-label={title} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && event.target !== keys.current) { event.preventDefault(); done() } }}>
        <header className="live-view-head">
          <div className="live-view-title">
            <strong>{title}</strong>
            {computer === undefined ? null : <small>{computer}</small>}
          </div>
          <button type="button" className="remote-button primary" autoFocus onClick={done}>Done</button>
        </header>
        <form className="live-view-address" onSubmit={(event) => { event.preventDefault(); const url = (draft ?? '').trim(); setDraft(undefined); if (url !== '') send({ type: 'go', url }) }}>
          <button type="button" className="icon-button" aria-label="Back" title="Back" disabled={state !== 'live'} onClick={() => send({ type: 'back' })}><Icon name="left" /></button>
          <input type="url" aria-label="Address" placeholder="Address" value={draft ?? shown} disabled={state !== 'live'} autoCapitalize="off" autoCorrect="off" spellCheck={false} onFocus={() => setDraft(shown)} onBlur={() => setDraft(undefined)} onChange={(event) => setDraft(event.target.value)} />
          {phone() ? <button type="button" className="icon-button" aria-label="Keyboard" title="Keyboard" disabled={state !== 'live'} onClick={() => keys.current?.focus()}><Icon name="keyboard" /></button> : null}
        </form>
        <div className="live-view-screen">
          {state === 'opening' ? <p className="live-view-note" role="status"><span className="spinner-turn"><Icon name="spinner" /></span> Opening geckit:{name}…</p> : null}
          {state === 'failed' ? (
            <div className="live-view-note" role="alert">
              <p>{problem}</p>
              <span className="live-view-actions"><button type="button" className="remote-button" onClick={onClose}>Close</button><button type="button" className="remote-button primary" onClick={() => { setProblem(''); setState('opening'); setTries((one) => one + 1) }}>Try again</button></span>
            </div>
          ) : null}
          {frame === undefined ? null : (
            <img
              className={state === 'live' ? 'live-view-picture' : 'live-view-picture dim'}
              src={`data:image/jpeg;base64,${frame.jpeg}`}
              alt={frame.title === '' ? `geckit:${name}` : frame.title}
              width={frame.width}
              height={frame.height}
              draggable={false}
              onLoad={(event) => { const screen = event.currentTarget.parentElement; if (phone() && screen !== null && !centered.current) { centered.current = true; screen.scrollLeft = (screen.scrollWidth - screen.clientWidth) / 2 } }}
              onClick={(event) => { const point = at(event); if (point !== undefined) send({ type: 'click', ...point }); keys.current?.focus({ preventScroll: true }) }}
              onWheel={(event) => { const point = at(event); if (point !== undefined) send({ type: 'wheel', ...point, dy: Math.round(event.deltaY) }) }}
            />
          )}
          <textarea
            ref={keys}
            className="live-view-keys"
            aria-label="Type into the page"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value=""
            onChange={(event) => { const text = event.target.value; if (text !== '') send({ type: 'text', text }) }}
            onKeyDown={(event) => { if (KEYS.has(event.key)) { event.preventDefault(); send({ type: 'key', key: event.key }) } }}
          />
        </div>
      </section>
    </div>,
    document.body,
  )
}
