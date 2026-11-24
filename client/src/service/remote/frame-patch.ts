import { PNG } from 'pngjs'
import type { TabHandoffPatch } from '../../shared/live-view'

export function framePatch(before: PNG, after: PNG): TabHandoffPatch | null | undefined {
  const { width, height } = after
  if (before.width !== width || before.height !== height) return undefined
  const previous = new Uint32Array(before.data.buffer, before.data.byteOffset, width * height)
  const current = new Uint32Array(after.data.buffer, after.data.byteOffset, width * height)
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (previous[row + x] === current[row + x]) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = y
    }
  }
  if (right < 0) return null
  const patchWidth = right - left + 1
  const patchHeight = bottom - top + 1
  if (patchWidth * patchHeight > width * height / 2) return undefined
  const patch = new PNG({ width: patchWidth, height: patchHeight })
  for (let y = 0; y < patchHeight; y++) {
    const from = ((top + y) * width + left) * 4
    after.data.copy(patch.data, y * patchWidth * 4, from, from + patchWidth * 4)
  }
  return { x: left, y: top, png: PNG.sync.write(patch).toString('base64') }
}
