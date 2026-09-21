import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Tooltips drawn by the page, for every element with a title.
 *
 * The native ones did not show in the Chat window, so the title is taken off
 * while the pointer is over the element and put back when it leaves.
 */

const WAIT = 450
// Moving from one tooltip to the next shows the next at once, as macOS does.
const STILL_WARM = 700
const KEYS = /^(.*\S)\s+\(((?:Cmd|Ctrl|Alt|Shift|Esc|Enter)\b[^()]*)\)$/

interface Tip {
  readonly text: string
  readonly around: DOMRect
}

export function Tips(): React.JSX.Element | null {
  const [tip, setTip] = useState<Tip | undefined>()
  const bubble = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let over: { readonly element: Element; readonly text: string } | undefined
    let timer: number | undefined
    let shown = false
    let hiddenAt = 0

    const hide = (): void => {
      window.clearTimeout(timer)
      if (over !== undefined && !over.element.hasAttribute('title')) over.element.setAttribute('title', over.text)
      if (shown) hiddenAt = Date.now()
      over = undefined
      shown = false
      setTip(undefined)
    }

    const enter = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      if (target === null || (over !== undefined && over.element.contains(target))) return
      hide()
      const element = target.closest('[title]')
      const text = element?.getAttribute('title') ?? ''
      if (element === null || text === '') return
      element.removeAttribute('title')
      over = { element, text }
      const show = (): void => {
        if (over?.element !== element || !element.isConnected) return
        shown = true
        setTip({ text, around: element.getBoundingClientRect() })
      }
      if (Date.now() - hiddenAt < STILL_WARM) show()
      else timer = window.setTimeout(show, WAIT)
    }

    document.addEventListener('pointerover', enter)
    document.documentElement.addEventListener('pointerleave', hide)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', enter)
      document.documentElement.removeEventListener('pointerleave', hide)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('wheel', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  useLayoutEffect(() => {
    const box = bubble.current
    if (tip === undefined || box === null) return
    const { width, height } = box.getBoundingClientRect()
    const below = tip.around.bottom + 6
    const top = below + height > window.innerHeight - 8 ? tip.around.top - height - 6 : below
    const left = tip.around.left + tip.around.width / 2 - width / 2
    box.style.top = `${String(Math.max(8, top))}px`
    box.style.left = `${String(Math.min(Math.max(8, left), window.innerWidth - width - 8))}px`
    box.style.visibility = 'visible'
  }, [tip])

  if (tip === undefined) return null
  const [, label = tip.text, keys] = KEYS.exec(tip.text) ?? []
  return (
    <div ref={bubble} className="tip" role="tooltip" style={{ visibility: 'hidden' }}>
      {label}
      {keys === undefined ? null : <kbd>{keys}</kbd>}
    </div>
  )
}
