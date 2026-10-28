import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import type { GeckoBubble, GeckoChoice } from '../../../shared/gecko'

/** What the bubble asks about the files dropped on the gecko, or the note it says. */
export function question({ files, note }: GeckoBubble): string {
  if (note !== undefined) return note
  return files === 1 ? 'What should I do with this file?' : `What should I do with these ${String(files)} files?`
}

/** Its choices, in order: the waiting conversation only when one waits; a note is only closed. */
export function choices({ waiting, files, note }: GeckoBubble): readonly { readonly choice: GeckoChoice; readonly label: string }[] {
  if (note !== undefined) return [{ choice: 'cancel', label: 'Close' }]
  return [
    { choice: 'task', label: files === 1 ? 'New task with this file' : 'New task with these files' },
    ...(waiting > 0 ? [{ choice: 'waiting' as const, label: 'Send to the waiting conversation' }] : []),
    { choice: 'cancel', label: 'Cancel' },
  ]
}

/** The bubble as drawn: its tail points at the gecko, on the side the gecko is. The window and the preview use the same one. */
export function BubbleCard({
  asked,
  side,
  focus = true,
  onChoose,
}: {
  readonly asked: GeckoBubble
  readonly side: 'left' | 'right'
  /** The first choice takes the keyboard; not in the preview's stills. */
  readonly focus?: boolean
  readonly onChoose: (choice: GeckoChoice) => void
}): React.JSX.Element {
  const id = useId()
  const list = useRef<HTMLDivElement>(null)
  return (
    <div
      className={`gecko-bubble gecko-bubble-${side}`}
      role="dialog"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const buttons = [...(list.current?.querySelectorAll('button') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }}
    >
      <p id={id}>{question(asked)}</p>
      <div ref={list} className="gecko-bubble-choices">
        {choices(asked).map((one, at) => (
          <button key={one.choice} type="button" autoFocus={focus && at === 0} onClick={() => onChoose(one.choice)}>
            {one.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The bubble's own window: asks main what to show, tells it its height, and goes with a choice, Esc, or a click beside it. */
export function Bubble({ side }: { readonly side: 'left' | 'right' }): React.JSX.Element | null {
  const [asked, setAsked] = useState<GeckoBubble | undefined>()
  const held = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void window.geckit.gecko.bubble().then(setAsked)
    // A note that tells how something goes, as the speech model downloading, is told again as it moves.
    const offNote = window.geckit.gecko.onNote((note) => setAsked((was) => (was === undefined ? was : { ...was, note })))
    const esc = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.geckit.gecko.choose('cancel')
    }
    window.addEventListener('keydown', esc)
    return () => {
      offNote()
      window.removeEventListener('keydown', esc)
    }
  }, [])
  useLayoutEffect(() => {
    if (asked !== undefined && held.current !== null) window.geckit.gecko.fit(Math.ceil(held.current.getBoundingClientRect().height))
  }, [asked])
  if (asked === undefined) return null
  return (
    <div
      ref={held}
      className="gecko-bubble-window"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) window.geckit.gecko.choose('cancel')
      }}
    >
      <BubbleCard asked={asked} side={side} onChoose={(choice) => window.geckit.gecko.choose(choice)} />
    </div>
  )
}
