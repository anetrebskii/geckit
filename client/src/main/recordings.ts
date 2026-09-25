import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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

export function keepRecording(video: Uint8Array): string {
  mkdirSync(folder(), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(folder(), `${stamp}.webm`)
  writeFileSync(path, video)
  return path
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
