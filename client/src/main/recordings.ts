import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

/**
 * The videos of screen recordings, kept so Claude can take more frames from one.
 *
 * A week is long enough for the work a recording started, and nothing reads
 * them after that, so each start of the application clears the older ones.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000

const folder = (): string => join(app.getPath('userData'), 'recordings')

/**
 * The video being recorded, written a second at a time as it comes, so a
 * recording of any length is never held whole in memory. It is thrown away
 * with the recording unless something was sent with it.
 */
let open: { readonly path: string; kept: boolean } | undefined

export function startRecording(): string {
  dropRecording()
  mkdirSync(folder(), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(folder(), `${stamp}.webm`)
  writeFileSync(path, '')
  open = { path, kept: false }
  return path
}

export function addToRecording(part: Uint8Array): void {
  if (open !== undefined) appendFileSync(open.path, part)
}

/** Something was sent that names the video, so it stays for its week. */
export function keepRecording(): void {
  if (open !== undefined) open.kept = true
  open = undefined
}

/** The recording was thrown away, so its video goes with it. */
export function dropRecording(): void {
  const was = open
  open = undefined
  if (was === undefined || was.kept) return
  try {
    unlinkSync(was.path)
  } catch {
    // Gone already.
  }
}

export function sweepRecordings(): void {
  let names: string[]
  try {
    names = readdirSync(folder())
  } catch {
    return
  }
  const before = Date.now() - WEEK
  for (const name of names) {
    const path = join(folder(), name)
    try {
      if (statSync(path).mtimeMs < before) unlinkSync(path)
    } catch {
      // Gone already.
    }
  }
}
