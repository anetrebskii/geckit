import { describe, expect, it } from 'vitest'

import { BADGE_SIDE, badgePixels, badgeText } from '../src/main/overlay'

/** The pixel at a place, as red, green, blue and alpha. */
const at = (pixels: Buffer, x: number, y: number): readonly number[] => {
  const i = (y * BADGE_SIDE + x) * 4
  return [pixels[i + 2] ?? 0, pixels[i + 1] ?? 0, pixels[i] ?? 0, pixels[i + 3] ?? 0]
}

/** How many pixels are white: the digits' own. */
const white = (pixels: Buffer): number =>
  [...Array(BADGE_SIDE * BADGE_SIDE).keys()].filter((i) => pixels[i * 4] === 255 && pixels[i * 4 + 1] === 255 && pixels[i * 4 + 2] === 255).length

describe('the taskbar badge', () => {
  it('says the count, and past two digits just 99', () => {
    expect(badgeText(1)).toBe('1')
    expect(badgeText(42)).toBe('42')
    expect(badgeText(100)).toBe('99')
    expect(badgeText(-3)).toBe('0')
  })

  it('is a red disc with the corners clear and the number in white', () => {
    const pixels = badgePixels(1)
    expect(pixels.length).toBe(BADGE_SIDE * BADGE_SIDE * 4)
    expect(at(pixels, 0, 0)).toEqual([0, 0, 0, 0])
    expect(at(pixels, 2, 7)).toEqual([214, 48, 48, 255])
    // The 1's stem stands in the middle column.
    expect(at(pixels, 7, 7)).toEqual([255, 255, 255, 255])
  })

  it('keeps every lit pixel inside the disc, two digits included', () => {
    for (const count of [1, 8, 42, 99, 100]) {
      const pixels = badgePixels(count)
      const centre = (BADGE_SIDE - 1) / 2
      for (let y = 0; y < BADGE_SIDE; y++) {
        for (let x = 0; x < BADGE_SIDE; x++) {
          const [r, g, b, a] = at(pixels, x, y)
          if (r === 255 && g === 255 && b === 255) expect((x - centre) ** 2 + (y - centre) ** 2).toBeLessThanOrEqual((BADGE_SIDE / 2) ** 2)
          if (a === 0) expect((x - centre) ** 2 + (y - centre) ** 2).toBeGreaterThan((BADGE_SIDE / 2) ** 2)
        }
      }
    }
  })

  it('is the same picture for the same count', () => {
    expect(badgePixels(7).equals(badgePixels(7))).toBe(true)
  })

  it('draws two digits side by side', () => {
    const one = badgePixels(1)
    const eleven = badgePixels(11)
    expect(eleven.equals(one)).toBe(false)
    expect(white(eleven)).toBe(white(one) * 2)
  })
})
