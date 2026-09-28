import type { ChatSession } from '../shared/api'
import { ordered } from '../shared/order'

/**
 * Which conversations hold a slot, and which of those waiting take the free
 * ones, after a job is done. A conversation holds one only while it works. A conversation with
 * queued messages and no turn running waits for one, and the free slots go to
 * those highest on the board.
 */

export type Standing = Pick<ChatSession, 'id' | 'state' | 'status' | 'at' | 'question'> & {
  /** Has queued messages that are its own to send, with no turn running. */
  readonly waiting: boolean
}

export function inProgress(status: ChatSession['status']): boolean {
  return status !== 'review' && status !== 'done'
}

/** How many slots are taken: one for each conversation working. A general question takes none. */
export function taken(all: readonly Standing[]): number {
  return all.filter((one) => one.state === 'working' && one.question !== true).length
}

/** The waiting ones given a slot, top of the board first. A general question waits for none. */
export function letGo(all: readonly Standing[], limit: number, order: readonly string[]): string[] {
  const questions = all.filter((one) => one.waiting && one.question === true).map((one) => one.id)
  const waiting = all.filter((one) => one.waiting && one.question !== true)
  const room = limit === 0 ? waiting.length : limit - taken(all)
  if (room <= 0) return questions
  const byTime = [...waiting].sort((one, other) => other.at - one.at)
  const board = [...ordered(byTime.filter((one) => inProgress(one.status)), order), ...byTime.filter((one) => !inProgress(one.status))]
  return [...questions, ...board.slice(0, room).map((one) => one.id)]
}
