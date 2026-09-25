import { describe, expect, it } from 'vitest'

import { clock, recordedNote, thinFrames } from '../src/shared/recording'

const at = (...times: number[]): { at: number }[] => times.map((one) => ({ at: one }))

describe('thinFrames', () => {
  it('keeps them all when there are few enough', () => {
    expect(thinFrames(at(1, 2, 3), 8)).toEqual(at(1, 2, 3))
  })

  it('drops the frames closest to the one before, keeping the first and the last', () => {
    expect(thinFrames(at(0, 1, 2, 10, 30, 31), 4)).toEqual(at(0, 10, 30, 31))
  })

  it('always keeps the last frame', () => {
    expect(thinFrames(at(0, 5, 6), 1)).toEqual(at(6))
  })

  it('spreads a long run of changes over the whole recording', () => {
    const every = at(...Array.from({ length: 24 }, (_one, index) => index * 5))
    const kept = thinFrames(every, 8).map((one) => one.at)
    expect(kept).toHaveLength(8)
    expect(kept[0]).toBe(0)
    expect(kept.at(-1)).toBe(115)
  })
})

describe('recordedNote', () => {
  it('says how long, when each frame was taken, and where the video is', () => {
    expect(recordedNote(42, at(2, 9, 42), '/tmp/r.webm')).toBe(
      'Recorded on the screen, 0:42. The frames are attached in order, taken at 0:02, 0:09, 0:42. The whole recording is at /tmp/r.webm if you need more of it.',
    )
  })

  it('leaves out what it does not have', () => {
    expect(recordedNote(65, [])).toBe('Recorded on the screen, 1:05.')
  })

  it('writes minutes and seconds', () => {
    expect(clock(300)).toBe('5:00')
  })
})
