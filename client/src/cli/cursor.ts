import type { ViewFrame, ViewInput } from '../shared/api'

export type CursorPoint = Pick<Extract<ViewInput, { type: 'click' | 'move' }>, 'x' | 'y'>
type CursorStep = CursorPoint & { readonly ms: number }

export function cursorPath(from: CursorPoint, to: CursorPoint, size: Pick<ViewFrame, 'width' | 'height'>, random: () => number = Math.random): CursorStep[] {
  const clamp = (point: CursorPoint): CursorPoint => ({ x: Math.max(0, Math.min(size.width - 1, point.x)), y: Math.max(0, Math.min(size.height - 1, point.y)) })
  const start = clamp(from)
  const end = clamp(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return [{ ...end, ms: 0 }]
  const duration = Math.min(1500, (120 + Math.sqrt(distance) * 24) * (0.85 + random() * 0.3))
  const bend = Math.min(120, distance * 0.18) * (0.3 + random() * 0.7) * (random() < 0.5 ? -1 : 1)
  const first = clamp({ x: start.x + dx * 0.3 - dy / distance * bend, y: start.y + dy * 0.3 + dx / distance * bend })
  const second = clamp({ x: start.x + dx * 0.7 - dy / distance * bend * 0.6, y: start.y + dy * 0.7 + dx / distance * bend * 0.6 })
  const steps = Math.ceil(duration / (1000 / 60))
  return Array.from({ length: steps }, (_, index) => {
    const progress = (index + 1) / steps
    const t = progress * progress * (3 - 2 * progress)
    const rest = 1 - t
    return {
      x: index === steps - 1 ? end.x : rest ** 3 * start.x + 3 * rest ** 2 * t * first.x + 3 * rest * t ** 2 * second.x + t ** 3 * end.x,
      y: index === steps - 1 ? end.y : rest ** 3 * start.y + 3 * rest ** 2 * t * first.y + 3 * rest * t ** 2 * second.y + t ** 3 * end.y,
      ms: duration * progress,
    }
  })
}
