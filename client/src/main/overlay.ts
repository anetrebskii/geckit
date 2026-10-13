import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'

/**
 * The count of conversations waiting for the person, drawn as a small badge for
 * the taskbar icon on Windows, where the Dock's own badge does not exist: a red
 * disc with the number in white. Drawn pixel by pixel, since main has no canvas.
 */

/** A badge's side, in pixels: what Windows asks for an overlay icon. */
export const BADGE_SIDE = 16

/** Each digit as five rows of three pixels, `#` lit. */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
}

/** What the badge says: the count, and past two digits just that there are many. */
export const badgeText = (count: number): string => (count > 99 ? '99' : String(Math.max(0, Math.trunc(count))))

/** The badge's pixels, BGRA with the alpha premultiplied, as `createFromBitmap` takes them. */
export function badgePixels(count: number): Buffer {
  const side = BADGE_SIDE
  const pixels = Buffer.alloc(side * side * 4)
  const put = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || x >= side || y < 0 || y >= side) return
    const at = (y * side + x) * 4
    pixels[at] = b
    pixels[at + 1] = g
    pixels[at + 2] = r
    pixels[at + 3] = 255
  }
  // The disc, red, with its corners left clear so it reads as round over the icon.
  const centre = (side - 1) / 2
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if ((x - centre) ** 2 + (y - centre) ** 2 <= (side / 2) ** 2) put(x, y, 214, 48, 48)
    }
  }
  // The digits, centred, one clear column between two of them.
  const text = badgeText(count)
  const width = text.length * 3 + (text.length - 1)
  const left = Math.floor((side - width) / 2)
  const top = Math.floor((side - 5) / 2)
  for (const [index, digit] of [...text].entries()) {
    const rows = DIGITS[digit]
    if (rows === undefined) continue
    for (const [y, row] of rows.entries()) {
      for (const [x, lit] of [...row].entries()) if (lit === '#') put(left + index * 4 + x, top + y, 255, 255, 255)
    }
  }
  return pixels
}

/** The badge as an image for the taskbar, or nothing when nobody waits. */
export function badgeIcon(count: number): NativeImage | null {
  if (count <= 0) return null
  return nativeImage.createFromBitmap(badgePixels(count), { width: BADGE_SIDE, height: BADGE_SIDE })
}
