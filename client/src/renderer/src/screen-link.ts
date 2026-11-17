import type { ScreenControl, ScreenControlled } from '../../shared/api'

/** The Mac's screen, where the page is on a phone joined to it; nothing on the Mac itself. */
export interface ScreenLink {
  readonly start: () => Promise<MediaStream>
  readonly stop: () => void
  readonly control: (order: ScreenControl) => Promise<ScreenControlled>
}

// In a server's workspace on the phone, the app around the frame holds the screen link of the computer that frame is open on.
export const screenLink = (): ScreenLink | undefined =>
  (window as { geckitScreen?: ScreenLink }).geckitScreen ?? (window.parent === window ? undefined : (window.parent as { geckitScreen?: ScreenLink }).geckitScreen)
