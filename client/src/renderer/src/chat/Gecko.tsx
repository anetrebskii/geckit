import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { geckoState } from '../../../shared/gecko'
import type { GeckoPose } from '../../../shared/gecko'
import { GECKO_ART } from './gecko-art'
import type { Chat } from './useChat'

/** What a screen reader and the tooltip say; review is not said on its own. */
function named(pose: GeckoPose, count: number): string {
  if (pose === 'waiting') return `${String(count)} ${count === 1 ? 'conversation' : 'conversations'} waiting for you`
  return pose === 'working' ? 'Claude is working' : 'Nothing running'
}

const VIEW = '1.5 1.5 30 31'

/** One layer of the gecko over the tile, its gradient and shadow named for this tile alone. */
function Layer({ art, className }: { readonly art: string; readonly className: string }): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const markup = art.replaceAll('#white', `#${id}-white`).replaceAll('#lift', `#${id}-lift`)
  return (
    <svg className={className} viewBox={VIEW} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-white`} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="28">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dff3e2" />
        </linearGradient>
        <filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.6" floodColor="#06280f" floodOpacity="0.35" />
        </filter>
      </defs>
      <g dangerouslySetInnerHTML={{ __html: markup }} />
    </svg>
  )
}

/** The glass tile of the app icon; asleep it loses its inner glow. */
function Tile({ glow }: { readonly glow: boolean }): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  return (
    <svg className="gecko-tile" viewBox={VIEW} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6edb7a" />
          <stop offset="0.55" stopColor="#3fb551" />
          <stop offset="1" stopColor="#1c8c33" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glass`} x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="blur" />
          <feComposite in="SourceAlpha" in2="blur" operator="arithmetic" k2="1" k3="-1" result="edge" />
          <feFlood floodColor="#e4ffe6" floodOpacity="0.8" />
          <feComposite in2="edge" operator="in" result="glow" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.9" result="s" />
          <feOffset in="s" dy="1" result="d" />
          <feFlood floodColor="#06280f" floodOpacity="0.3" />
          <feComposite in2="d" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
            {glow ? <feMergeNode in="glow" /> : null}
          </feMerge>
        </filter>
      </defs>
      <rect x="2.5" y="2.5" width="28" height="28" rx="8.4" fill={`url(#${id}-tile)`} stroke="#16782b" strokeWidth="0.6" filter={`url(#${id}-glass)`} />
      <path d="M4 10 Q4 3.6 10.6 3.6 L22.4 3.6 Q29 3.6 29 10 Q16.5 7.4 4 10 Z" fill={`url(#${id}-sheen)`} />
    </svg>
  )
}

/** The tile itself, drawn from what it is told: the preview and the bar use the same one. */
export function GeckoTile({
  pose,
  count,
  hopping = false,
  moving = true,
  onHopped,
  onPress,
}: {
  readonly pose: GeckoPose
  readonly count: number
  readonly hopping?: boolean
  /** False while the window is not seen: nothing walks. */
  readonly moving?: boolean
  readonly onHopped?: () => void
  readonly onPress?: () => void
}): React.JSX.Element {
  const name = named(pose, count)
  const walking = pose === 'working' && !hopping && moving
  return (
    <button
      type="button"
      className={`gecko no-drag gecko-${pose}${hopping ? ' gecko-hop' : ''}${walking ? ' gecko-walking' : ''}`}
      aria-label={name}
      title={name}
      onClick={onPress}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onHopped?.()
      }}
    >
      <Tile glow={pose !== 'asleep'} />
      <Layer art={GECKO_ART[hopping ? 'review' : pose]} className="gecko-art" />
      {walking ? <Layer art={`<g transform="translate(32.8 0) scale(-1 1)">${GECKO_ART.working}</g>`} className="gecko-art stride" /> : null}
      {pose === 'waiting' && count > 1 ? <span className="gecko-count" aria-hidden="true">{count}</span> : null}
    </button>
  )
}

/** Whether the window is seen: hidden or minimised, nothing animates. */
function useSeen(): boolean {
  const [seen, setSeen] = useState(() => !document.hidden)
  useEffect(() => {
    const look = (): void => setSeen(!document.hidden)
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])
  return seen
}

/** The gecko in the top bar: what the conversations are doing, and a press to the one that waits. */
export function Gecko({ chat }: { readonly chat: Chat }): React.JSX.Element | null {
  const state = useMemo(() => geckoState(chat.everyone), [chat.everyone])
  const seen = useSeen()
  const [hopping, setHopping] = useState(false)
  // The list as it was, so a card arriving in In review is seen once.
  const [before, setBefore] = useState(chat.everyone)
  if (before !== chat.everyone) {
    setBefore(chat.everyone)
    // Reduced motion and a window not seen keep the still pose; the hop is not saved for later.
    if (geckoState(chat.everyone, before).review && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) setHopping(true)
    // Waiting drops a hop under way: the person has something more urgent to see.
    else if (state.pose === 'waiting') setHopping(false)
  }
  // The one opened last, so pressing again opens the next.
  const opened = useRef<string | undefined>(undefined)
  if (!chat.settings.showGecko) return null
  const press = (): void => {
    const { waiting } = state
    if (waiting.length === 0) {
      if (chat.settings.chatView !== 'board') chat.change({ chatView: 'board' })
      chat.open({ kind: 'new' })
      return
    }
    const next = waiting[(waiting.indexOf(opened.current ?? '') + 1) % waiting.length]
    if (next === undefined) return
    opened.current = next
    chat.goTo(next)
  }
  return <GeckoTile pose={state.pose} count={state.waiting.length} hopping={hopping} moving={seen} onHopped={() => setHopping(false)} onPress={press} />
}
