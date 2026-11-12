import { describe, expect, it } from 'vitest'
import { cursorPath } from '../src/cli/cursor'

describe('natural test-browser mouse paths', () => {
  const size = { width: 1280, height: 800 }

  it('curves between endpoints, accelerates and decelerates, and lands exactly on the target', () => {
    const from = { x: 100, y: 300 }
    const to = { x: 1100, y: 300 }
    const path = cursorPath(from, to, size, () => 0.6)
    expect(path.length).toBeGreaterThan(20)
    expect(path.some((point) => Math.abs(point.y - from.y) > 10)).toBe(true)
    expect(path.at(-1)).toMatchObject(to)
    const distances = path.map((point, index) => Math.hypot(point.x - (path[index - 1] ?? from).x, point.y - (path[index - 1] ?? from).y))
    expect(distances[0]).toBeLessThan(Math.max(...distances) / 4)
    expect(distances.at(-1)).toBeLessThan(Math.max(...distances) / 4)
    expect(path.every((point, index) => point.ms > (path[index - 1]?.ms ?? 0))).toBe(true)
    expect(path.at(-1)?.ms).toBeLessThanOrEqual(1500)
  })

  it('keeps edge paths inside a resized viewport and bounds long moves', () => {
    for (const random of [() => 0, () => 0.999]) {
      const path = cursorPath({ x: 2000, y: 1400 }, { x: 0, y: 0 }, { width: 390, height: 700 }, random)
      expect(path.every(({ x, y }) => x >= 0 && x < 390 && y >= 0 && y < 700)).toBe(true)
      expect(path.at(-1)).toMatchObject({ x: 0, y: 0 })
      expect(path.at(-1)?.ms).toBeLessThanOrEqual(1500)
    }
  })

  it('adds no travel delay when already at the target and varies repeated trajectories', () => {
    expect(cursorPath({ x: 40, y: 50 }, { x: 40, y: 50 }, size)).toEqual([{ x: 40, y: 50, ms: 0 }])
    const from = { x: 100, y: 200 }
    const to = { x: 1000, y: 500 }
    expect(cursorPath(from, to, size, () => 0.1)).not.toEqual(cursorPath(from, to, size, () => 0.9))
  })
})
