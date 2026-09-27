/** The hosts this phone is paired with, which the app on the phone keeps; nothing anywhere else. */
export interface Macs {
  /** Each with the name it goes by here, and `told`, the name the host gives itself, which a host reached over SSH says too. */
  readonly list: () => readonly { readonly name: string; readonly told?: string; readonly current: boolean; readonly favorite: boolean }[]
  readonly switchTo: (index: number) => void
  readonly add: () => void
  readonly forget: (index: number) => void
  /** An empty name gives back the one the host tells. */
  readonly rename: (index: number, name: string) => void
  readonly favorite: (index: number, on: boolean) => void
}

export const macs = (): Macs | undefined => (window as { geckitMacs?: Macs }).geckitMacs
