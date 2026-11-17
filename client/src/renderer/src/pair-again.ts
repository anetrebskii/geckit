import { PAIR_AGAIN } from '../../shared/pairing'

/** A phone paired the old way reads but cannot send; this says so until it is paired again. */
export const PAIR_AGAIN_KEY = 'pairAgain'
let needed = false
let hidden = false
const listeners = new Set<() => void>()
const told = (): void => { for (const one of listeners) one() }

export const pairAgain = {
  /** Whether sending is closed to this phone. */
  needed: (): boolean => needed,
  /** Whether the card is shown: "Not now" hides it until the app is opened again. */
  shown: (): boolean => needed && !hidden,
  need: (): void => {
    if (needed) return
    needed = true
    try { localStorage.setItem(PAIR_AGAIN_KEY, '1') } catch { /* the card still shows */ }
    told()
  },
  hide: (): void => { hidden = true; told() },
  on: (said: () => void): (() => void) => { listeners.add(said); return () => { listeners.delete(said) } },
  /** A failure that means this, from a call over the old pairing. */
  is: (error: unknown): boolean => error instanceof Error && error.message === PAIR_AGAIN,
}
