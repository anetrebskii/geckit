import type { RecordedFrame } from './api'

/** The longest recording, in seconds: one problem is shown in under a minute, a walk through a flow in five. */
export const LONGEST = 300

/** When the time turns into a countdown, so the sentence can be finished. */
export const WARN = 270

/** The most frames sent with a recording: each costs about a page of text, and more makes Claude skim. */
export const MOST_FRAMES = 8

/** How many frames are held while recording, before the closest two in time are made one. */
export const HELD_FRAMES = 24

export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`

/**
 * The frames cut down to `most`, keeping the ones furthest apart in time.
 *
 * The frame that follows its neighbour most closely goes first, over and over,
 * so the start, the middle and the end all stay. The last frame always stays:
 * it is what was on the screen when the point was made.
 */
export function thinFrames<T extends Pick<RecordedFrame, 'at'>>(frames: readonly T[], most: number): T[] {
  const kept = [...frames]
  while (kept.length > most && kept.length > 1) {
    let closest = 1
    for (let at = 2; at < kept.length - 1; at++) {
      if ((kept[at]?.at ?? 0) - (kept[at - 1]?.at ?? 0) < (kept[closest]?.at ?? 0) - (kept[closest - 1]?.at ?? 0)) closest = at
    }
    // Only two left and one must go: it is the first, since the last stays.
    kept.splice(kept.length === 2 ? 0 : Math.min(closest, kept.length - 2), 1)
  }
  return kept
}

/** What goes under the words, so Claude knows what the pictures are and where the rest of them is. */
export function recordedNote(seconds: number, frames: readonly Pick<RecordedFrame, 'at'>[], video?: string): string {
  const times = frames.map((one) => clock(one.at)).join(', ')
  const said = [
    `Recorded on the screen, ${clock(seconds)}.`,
    frames.length === 0 ? '' : `The frames are attached in order, taken at ${times}.`,
    video === undefined ? '' : `The whole recording is at ${video} if you need more of it.`,
  ]
  return said.filter((one) => one !== '').join(' ')
}
