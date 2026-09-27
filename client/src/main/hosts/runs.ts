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
}

export interface RunsStore {
  all(): Readonly<Record<string, RunRecord>>
  get(session: string): RunRecord | undefined
  set(session: string, record: RunRecord): void
  /** Only the offset has moved: written a little later, since it moves with every line. */
  read(session: string, offset: number): void
  delete(session: string): void
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
      if (was === undefined || was.offset === offset) return
      runs = { ...runs, [session]: { ...was, offset } }
      soon ??= setTimeout(write, 1_000)
    },
    delete(session) {
      if (runs[session] === undefined) return
      const { [session]: _gone, ...rest } = runs
      runs = rest
      write()
    },
  }
}
