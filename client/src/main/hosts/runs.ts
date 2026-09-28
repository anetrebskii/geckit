import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * The runs on hosts GeckIt holds, kept across a restart: which conversation,
 * on which host and project, and how far its output has been read. A run
 * still here at the next start is picked up where it was left.
 */

export interface RunRecord {
  readonly host: string
  readonly root: string
  readonly offset: number
  readonly started: number
  /**
   * The byte the earliest control_request not yet answered began at, if one
   * is outstanding. `read` never carries the offset kept here past this: a
   * restart's reattach then reads from before that request rather than after
   * it, so the card it waits on is asked again instead of lost.
   */
  readonly pending?: number
}

export interface RunsStore {
  all(): Readonly<Record<string, RunRecord>>
  get(session: string): RunRecord | undefined
  set(session: string, record: RunRecord): void
  /** Only the offset has moved: written a little later, since it moves with every line. */
  read(session: string, offset: number): void
  /**
   * The byte an unanswered control_request began at; nothing once it is
   * answered or there is none. Clearing it takes `at`, the run's own offset
   * right then, written in the same turn: without it the kept offset stays
   * capped at the question until the next line happens to arrive, and a quit
   * in between (a quiet tool call, say) replays a card already answered.
   */
  pending(session: string, offset: number | undefined, at?: number): void
  delete(session: string): void
  /** Waits for a debounced write still owed to land, for quitting without losing the last second of it. */
  flush(): Promise<void>
}

export function runsAt(path: string): RunsStore {
  let runs: Record<string, RunRecord> = {}
  try {
    runs = JSON.parse(readFileSync(path, 'utf8')) as Record<string, RunRecord>
  } catch {
    runs = {}
  }
  let soon: NodeJS.Timeout | undefined
  const write = (): void => {
    clearTimeout(soon)
    soon = undefined
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.new`, JSON.stringify(runs, undefined, 2))
      renameSync(`${path}.new`, path)
    } catch {
      // Not written: a restart starts the run over with --resume instead of reading on.
    }
  }
  return {
    all: () => runs,
    get: (session) => runs[session],
    set(session, record) {
      runs = { ...runs, [session]: record }
      write()
    },
    read(session, offset) {
      const was = runs[session]
      if (was === undefined) return
      const capped = was.pending === undefined ? offset : Math.min(offset, was.pending)
      if (was.offset === capped) return
      runs = { ...runs, [session]: { ...was, offset: capped } }
      soon ??= setTimeout(write, 1_000)
    },
    pending(session, offset, at) {
      const was = runs[session]
      if (was === undefined) return
      const settledOffset = at === undefined ? was.offset : Math.max(was.offset, at)
      if (was.pending === offset && was.offset === settledOffset) return
      const { pending: _gone, ...rest } = was
      const withOffset = { ...rest, offset: settledOffset }
      runs = { ...runs, [session]: offset === undefined ? withOffset : { ...withOffset, pending: offset } }
      soon ??= setTimeout(write, 1_000)
    },
    delete(session) {
      if (runs[session] === undefined) return
      const { [session]: _gone, ...rest } = runs
      runs = rest
      write()
    },
    async flush() {
      if (soon !== undefined) write()
    },
  }
}
