import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { connect, createServer } from 'node:net'

import { askedEndpoint, endpointOnDisk } from '../cli/endpoint'
import { rpcEndpoint } from './rpc'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function ownerIdentity(directory: string): string | undefined {
  try { return readFileSync(join(directory, 'service-owner.json'), 'utf8') }
  catch (error) { if (hasCode(error, 'ENOENT')) return undefined; throw error }
}

function ownerStopped(identity: string): boolean {
  let owner: unknown
  try { owner = JSON.parse(identity) } catch { return false }
  if (owner === null || typeof owner !== 'object' || !('pid' in owner) || typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false
  try { process.kill(owner.pid, 0); return false }
  catch (error) { return hasCode(error, 'ESRCH') }
}

/** Starting a contender is harmless; only the service may recover files after taking ownership. */
export function canStartService(directory: string): boolean {
  const owner = ownerIdentity(directory)
  return owner === undefined || (process.platform === 'win32' && ownerStopped(owner))
}

function unusedEndpoint(endpoint: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('error', (error) => {
      if (hasCode(error, 'ENOENT') || hasCode(error, 'ECONNREFUSED')) resolve(true)
      else reject(new Error('Could not verify that the previous GeckIt service stopped. Its files were preserved.', { cause: error }))
    })
    socket.setTimeout(1_000, () => socket.destroy(new Error('GeckIt service ownership check timed out.')))
  })
}

/** Windows releases this exclusive pipe on process death, even when no shutdown handler runs. */
async function ownWindowsPipe(directory: string): Promise<() => Promise<void>> {
  const server = createServer((socket) => socket.destroy())
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error) => reject(new Error('GeckIt is already running for this data directory, or its ownership could not be acquired.', { cause: error })))
    server.listen({ path: `${askedEndpoint(realpathSync(directory))}-owner`, exclusive: true }, resolve)
  })
  return () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

export async function ownDataDirectory(directory: string): Promise<() => Promise<void>> {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const unlock = process.platform === 'win32' ? await ownWindowsPipe(directory) : async () => undefined
  const path = join(directory, 'service-owner.json')
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() })
  let file: number | undefined
  try {
    if (process.platform === 'win32') {
      const previous = ownerIdentity(directory)
      if (previous !== undefined && !ownerStopped(previous)) throw new Error('GeckIt is already running for this data directory, or its previous owner could not be verified. Its files were preserved.')
      if (!await unusedEndpoint(askedEndpoint(directory)) || !await unusedEndpoint(rpcEndpoint(directory))) throw new Error('A GeckIt socket already exists for this data directory. Its files were preserved.')
      if (ownerIdentity(directory) !== previous) throw new Error('GeckIt service ownership changed during startup. Its files were preserved.')
      if (previous !== undefined) unlinkSync(path)
    }
    try { file = openSync(path, 'wx', 0o600) }
    catch (error) {
      if (hasCode(error, 'EEXIST')) throw new Error('GeckIt is already running for this data directory. If its process crashed, verify it has stopped before removing service-owner.json and geckit.sock.', { cause: error })
      throw error
    }
    writeFileSync(file, identity)
    if (endpointOnDisk() && existsSync(askedEndpoint(directory))) throw new Error('A GeckIt socket already exists for this data directory. Connect to the running instance, or verify it has stopped before removing its stale socket.')
    if (process.platform === 'win32') rmSync(join(directory, 'operator-token'), { force: true })
  } catch (error) {
    try {
      if (file !== undefined) { closeSync(file); unlinkSync(path) }
    } finally { await unlock() }
    throw error
  }
  let released = false
  return async () => {
    if (released) return
    released = true
    try {
      closeSync(file)
      if (ownerIdentity(directory) === identity) unlinkSync(path)
    } finally { await unlock() }
  }
}
