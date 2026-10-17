import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * What Android's Back closes: whatever was opened last and is still shown (a
 * sheet, a menu, a preview, the screen, a conversation, a page pushed over
 * another), each registered while it is up. A tab not in front keeps its pages
 * mounted, so one is passed over while it is not shown. The iPhone has no Back,
 * and nothing calls this there or on the computer.
 */
interface Backable {
  readonly close: () => void
  readonly shown: () => boolean
}

const stack: Backable[] = []

/** Registers `close` as what Back does while this is mounted and `held`, when given, is shown; nothing for an undefined `close`. */
export function useBack(close: (() => void) | undefined, held?: RefObject<HTMLElement | null>): void {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  }, [close])
  const on = close !== undefined
  useEffect(() => {
    if (!on) return
    const one: Backable = {
      close: () => latest.current?.(),
      shown: () => {
        const element = held?.current
        return element === null || element === undefined || element.getClientRects().length > 0
      },
    }
    stack.push(one)
    return () => {
      const at = stack.lastIndexOf(one)
      if (at !== -1) stack.splice(at, 1)
    }
  }, [on, held])
}

/** Closes what is on top; false when nothing is, so the app goes to the background as Android's own do. */
export function goBack(): boolean {
  for (let at = stack.length - 1; at >= 0; at--) {
    const one = stack[at]
    if (one?.shown() === true) {
      one.close()
      return true
    }
  }
  return false
}

;(window as { geckitBack?: () => boolean }).geckitBack = goBack
