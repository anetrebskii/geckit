import type { StatusMove } from './api'

export function formatStatusMove(move: StatusMove): string {
  const who = move.attribution
  const transition = `${move.before ?? 'unknown'} → ${move.status}`
  const time = new Date(move.at).toISOString()
  if (who === undefined) return `${time} · ${transition} · Legacy / unknown`
  const executor = who.executor === 'manager' ? 'Manager session' : who.executor === 'user' ? 'User' : 'Worker / system'
  return [time, transition, executor, `Origin: ${who.origin}`, ...(['channel', 'session', 'thread', 'operation', 'message'] as const).flatMap((key) => who[key] === undefined ? [] : [`${key}: ${who[key]}`])].join(' · ')
}
