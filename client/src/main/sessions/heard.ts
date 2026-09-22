import type { BackgroundTask, CardAnswer, PlanUsage, SessionImage, SessionItem } from '../../shared/api'
import type { Wanted } from './rule'

/** What a session hears from the process holding it. */
export type Signal =
  | {
      readonly kind: 'started'
      readonly session: string
      readonly model?: string
      readonly key: boolean
      /** The permission mode it actually runs in, which is not always the one it was asked for. */
      readonly mode?: string
    }
  /** Something is being done, said the way a row says it: "reading src/main.ts". */
  | { readonly kind: 'doing'; readonly what: string }
  | { readonly kind: 'said'; readonly text: string }
  /** A write is on its way, whoever allowed it. Absolute paths. */
  | { readonly kind: 'writing'; readonly paths: readonly string[] }
  /**
   * Something may not go ahead unasked. `ask` is what the answer is handed back
   * under, and `line` is the line already drawn for the thing being asked about.
   */
  | { readonly kind: 'asks'; readonly ask: string; readonly wanted: Wanted; readonly line?: string }
  /** The tool's own word for how it is running, which changes when a plan is let through. */
  | { readonly kind: 'mode'; readonly mode: string }
  /** How full the context is after the last answer, and what this run of the tool has cost so far. */
  | { readonly kind: 'spend'; readonly used?: number; readonly cost?: number }
  /** How much of the plan is spent. Said by the tool after every turn, for the whole account. */
  | { readonly kind: 'plan'; readonly plan: PlanUsage }
  /** Everything it has running in the background now, said each time that changes. */
  | { readonly kind: 'tasks'; readonly tasks: readonly BackgroundTask[] }
  /** A turn nobody here started: something in the background finished, or a message came from Remote Control. */
  | { readonly kind: 'begun' }
  | {
      readonly kind: 'ended'
      /** `offPlan` is never the tool's: it is what Sessions says when it would not start one on a key. */
      readonly how: 'done' | 'stopped' | 'failed' | 'limit' | 'signedOut' | 'offPlan'
      readonly text?: string
      /** In milliseconds, where the tool said when. */
      readonly resetsAt?: number
    }

export interface Heard {
  readonly items: SessionItem[]
  readonly gone: string[]
  readonly signals: Signal[]
}

/** One conversation being held by a process. */
export interface Driver {
  /** Starts a turn. `before` goes ahead of the message as blocks of its own: the commands run with `!` since the last one. */
  send(text: string, images?: readonly SessionImage[], before?: readonly string[]): void
  answer(ask: string, answer: CardAnswer | string): void
  /** How it may act from here on, without starting it again. What is under `again` is handed back to be tried once more under it. */
  permit?(mode: 'auto' | 'manual', again: readonly string[]): void
  /** A request on the tool's control channel, answered with what it said back. Refused where the tool refused it or has gone. */
  control?(request: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>
  stop(): void
  /** Lets go of it, settled once the process has gone. The conversation stays where the tool keeps it. */
  end(): Promise<void>
}

/**
 * What one of several things asked at once is answered under. The first keeps
 * the plain id, so the usual case of one reads the same watched and read back.
 */
export const askId = (request: string, index: number): string =>
  index === 0 ? request : `${request}#${String(index)}`

/** The id a card is drawn under, so the same card read back later lands on it. */
export const cardId = (ask: string): string => `card:${ask}`
