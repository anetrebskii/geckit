import type { ChatSession } from '../../../shared/api'

/** Every conversation one started, in the order each was started, with what those started under them. */
export function startedFrom(sessions: readonly ChatSession[], id: string, depth = 0): { readonly session: ChatSession; readonly depth: number }[] {
  return sessions
    .filter((one) => one.parent === id)
    .sort((one, other) => (one.created ?? 0) - (other.created ?? 0))
    .flatMap((one) => [{ session: one, depth }, ...startedFrom(sessions, one.id, depth + 1)])
}

/** "Started 3", the conversations one asked for, counted as its request blocks and card count them. */
export const startedCount = (sessions: readonly ChatSession[], id: string): number => sessions.filter((one) => one.parent === id).length
