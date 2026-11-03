import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { askedEndpoint, endpointOnDisk } from '../cli/endpoint'

export function ownDataDirectory(directory: string): () => void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'service-owner.json')
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() })
  let file: number
  try { file = openSync(path, 'wx', 0o600) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error('GeckIt is already running for this data directory. If its process crashed, verify it has stopped before removing service-owner.json and geckit.sock.', { cause: error })
    throw error
  }
  try {
    writeFileSync(file, identity)
    if (endpointOnDisk() && existsSync(askedEndpoint(directory))) throw new Error('A GeckIt socket already exists for this data directory. Connect to the running instance, or verify it has stopped before removing its stale socket.')
  } catch (error) {
    closeSync(file)
    unlinkSync(path)
    throw error
  }
  let released = false
  return () => {
    if (released) return
    released = true
    closeSync(file)
    if (existsSync(path) && readFileSync(path, 'utf8') === identity) unlinkSync(path)
  }
}
