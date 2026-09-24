/** iOS dictation, when the app on the phone lends it; nothing anywhere else. */
export interface Dictate {
  /** Resolves once it listens, and rejects with what stands in the way. */
  readonly start: (language: string, heard: (text: string) => void, ended: () => void) => Promise<void>
  readonly stop: () => void
}

export const dictate = (): Dictate | undefined => (window as { geckitDictate?: Dictate }).geckitDictate
