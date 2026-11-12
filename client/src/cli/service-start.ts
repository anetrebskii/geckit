import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { connectRpc } from '../core/rpc'
import { canStartService } from '../core/ownership'
import type { ServiceEvents, ServiceMethods } from '../service/application'

export async function connectService(directory: string, start: boolean) {
  const connect = () => connectRpc<ServiceMethods, ServiceEvents>(directory, readFileSync(join(directory, 'operator-token'), 'utf8').trim())
  try { return await connect() } catch (error) { if (!start) throw error }
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  let child: ReturnType<typeof spawn> | undefined
  let failure: Error | undefined
  if (canStartService(directory)) {
    const output = openSync(join(directory, 'service.log'), 'a', 0o600)
    try {
      child = spawn(process.execPath, [join(import.meta.dirname, 'service.js'), '--data', directory], { detached: true, windowsHide: true, stdio: ['ignore', output, output], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      child.once('error', (error) => { failure = error })
      child.unref()
    } finally { closeSync(output) }
  }
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    if (failure !== undefined) throw failure
    try { return await connect() } catch { /* Wait for the owner to finish starting. */ }
    // Another launcher can own the directory even after our child loses the race.
    if (process.platform !== 'win32' && child?.exitCode !== undefined && child.exitCode !== null) break
    await delay(100)
  }
  throw new Error(`GeckIt service did not start. See ${join(directory, 'service.log')}. Existing service ownership was preserved.`)
}
