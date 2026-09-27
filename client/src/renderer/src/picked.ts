/** A video picked from the phone's Photos, as the app on the phone reads it; nothing anywhere else. */
export interface PickedVideo {
  readonly path: string
  readonly ext: string
  readonly seconds: number
  readonly bytes: number
}

export interface Picking {
  /** Nothing when the picker was closed without a video. */
  readonly pick: () => Promise<PickedVideo | undefined>
  /** The newest screen recording made after `since` (ms), with when it was made and a picture from its middle; nothing when there is none yet. */
  readonly latest: (since: number) => Promise<(PickedVideo & { readonly made: number; readonly thumb: string }) | undefined>
  readonly words: (video: PickedVideo, language: string) => Promise<string>
  readonly frames: (video: PickedVideo, count: number) => Promise<readonly { readonly at: number; readonly data: string }[]>
  /** Bytes `from` up to `to` of the file, to be sent to the Mac a piece at a time without holding the whole video. */
  readonly piece: (video: PickedVideo, from: number, to: number) => Promise<Blob>
  readonly drop: (video: PickedVideo) => void
}

export const picking = (): Picking | undefined => (window as { geckitPicking?: Picking }).geckitPicking
