/** The Mac's screen, where the page is on a phone joined to it; nothing on the Mac itself. */
export interface ScreenLink {
  readonly start: () => Promise<MediaStream>
  readonly stop: () => void
}

export const screenLink = (): ScreenLink | undefined => (window as { geckitScreen?: ScreenLink }).geckitScreen
