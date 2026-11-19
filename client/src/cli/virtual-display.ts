import { spawn as spawnProcess } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface VirtualDisplay { readonly display: string; readonly stop: () => void }
type Screen = { readonly width: number; readonly height: number }

export const MISSING_XVFB = 'Test browsers on a Linux computer without a screen need a virtual display. Install it with: sudo apt install xvfb'

/** Xvfb picks a free display itself and says its number on descriptor 3, so two browsers starting together never take the same one. */
export const xvfbArgs = (screen: Screen): string[] => ['-displayfd', '3', '-screen', '0', `${screen.width}x${screen.height}x24`, '-nolisten', 'tcp', '-noreset']

export function displayFrom(said: string): string | undefined {
  const number = /^\s*(\d+)\s*$/.exec(said)?.[1]
  return number === undefined ? undefined : `:${number}`
}

const isXvfb = (pid: number): boolean => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]?.endsWith('Xvfb') === true } catch { return false } }

/** A display left by a driver that did not close cleanly is stopped before its profile starts again. */
export function stopStale(pidFile: string, xvfb: (pid: number) => boolean = isXvfb): void {
  let pid: number
  try { pid = Number(readFileSync(pidFile, 'utf8')) } catch { return }
  if (Number.isInteger(pid) && pid > 0 && xvfb(pid)) { try { process.kill(pid, 'SIGTERM') } catch { /* It ended meanwhile. */ } }
  rmSync(pidFile, { force: true })
}

export function startVirtualDisplay(screen: Screen, pidFile: string, spawn: typeof spawnProcess = spawnProcess, wait = 10_000): Promise<VirtualDisplay> {
  stopStale(pidFile)
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try { child = spawn('Xvfb', xvfbArgs(screen), { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] }) } catch { reject(new Error(MISSING_XVFB)); return }
    let said = ''
    let last = ''
    let settled = false
    const stop = (): void => { if (child.exitCode === null) child.kill('SIGTERM'); rmSync(pidFile, { force: true }) }
    const fail = (message: string): void => { if (settled) return; settled = true; clearTimeout(timer); stop(); reject(new Error(message)) }
    const timer = setTimeout(() => fail(`The virtual display did not start: ${last || 'it said nothing within 10 seconds'}.`), wait)
    child.on('error', (error: NodeJS.ErrnoException) => fail(error.code === 'ENOENT' ? MISSING_XVFB : `The virtual display did not start: ${error.message}.`))
    child.on('exit', () => fail(`The virtual display did not start: ${last || 'Xvfb ended'}.`))
    child.stderr?.on('data', (chunk: Buffer) => { last = chunk.toString().trim().split('\n').pop() ?? last })
    child.stdio[3]?.on('data', (chunk: Buffer) => {
      said += chunk.toString()
      const display = displayFrom(said)
      if (display === undefined || settled) return
      settled = true
      clearTimeout(timer)
      if (child.pid !== undefined) { mkdirSync(dirname(pidFile), { recursive: true }); writeFileSync(pidFile, String(child.pid), { mode: 0o600 }) }
      resolve({ display, stop })
    })
  })
}
