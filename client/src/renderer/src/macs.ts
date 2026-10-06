/** The hosts this phone is paired with, which the app on the phone keeps; nothing anywhere else. */
export interface Macs {
  readonly list: () => readonly { readonly name: string; readonly current: boolean }[]
  readonly switchTo: (index: number) => void
  readonly add: () => void
  readonly forget: (index: number) => void
  /** An empty name gives back the one the host tells. */
  readonly rename: (index: number, name: string) => void
}

export const macs = (): Macs | undefined => (window as { geckitMacs?: Macs }).geckitMacs
