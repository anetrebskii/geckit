import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ folder: '', spawn: vi.fn(), trusted: vi.fn(() => true) }))
vi.mock('node:child_process', () => ({ spawn: native.spawn }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))
vi.mock('electron', () => ({
  app: { getPath: () => native.folder },
  systemPreferences: { isTrustedAccessibilityClient: native.trusted },
  screen: {
    getAllDisplays: () => [],
    getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1000, height: 800 } }),
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    dipToScreenPoint: (point: Electron.Point) => point,
  },
}))

class Hand extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
}

const originalPlatform = process.platform
let started: Hand[] = []

function latest(): Hand {
  const child = started.at(-1)
  if (child === undefined) throw new Error('No control helper started')
  return child
}

beforeEach(() => {
  native.folder = mkdtempSync(join(tmpdir(), 'geckit-control-'))
  Object.defineProperty(process, 'platform', { value: 'win32' })
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  vi.resetModules()
  started = []
  native.spawn.mockReset().mockImplementation(() => {
    const child = new Hand()
    started.push(child)
    return child
  })
  native.trusted.mockReset().mockReturnValue(true)
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
  vi.useRealTimers()
  rmSync(native.folder, { recursive: true, force: true })
})

describe('the native phone control boundary', () => {
  it.each(['ENOENT', 'EACCES'])('reports repeated spawn %s errors and stops retries during cooldown', async (code) => {
    const { control } = await import('../src/main/control')
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(control({ kind: 'where' }, undefined)).toEqual({ x: 0.5, y: 0.5 })
      latest().emit('error', Object.assign(new Error(`spawn powershell.exe ${code}`), { code }))
      latest().stdin.destroy()
      latest().emit('close', -1, null)
    }
    expect(control({ kind: 'click', button: 'left', count: 1 }, undefined)).toEqual({
      error: `Windows would not let GeckIt use the mouse and keyboard: spawn powershell.exe ${code}`,
    })
    expect(started).toHaveLength(3)
    vi.advanceTimersByTime(59_999)
    expect(control({ kind: 'where' }, undefined)).toHaveProperty('error')
    expect(started).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(control({ kind: 'where' }, undefined)).toEqual({ x: 0.5, y: 0.5 })
    expect(started).toHaveLength(4)
    latest().stdout.write('ready\n')
    control({ kind: 'type', text: 'Hi' }, undefined)
    expect(latest().stdin.read()?.toString()).toBe('t 72 105\n')
    expect(started).toHaveLength(4)
  })

  it('counts error, exit and close for the same helper once and releases an errored helper immediately', async () => {
    const { control } = await import('../src/main/control')
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(control({ kind: 'where' }, undefined)).not.toHaveProperty('error')
      latest().emit('error', new Error('blocked'))
      latest().emit('exit', 1, null)
      latest().emit('close', 1, null)
    }
    expect(control({ kind: 'where' }, undefined)).not.toHaveProperty('error')
    expect(started).toHaveLength(3)
    latest().emit('error', new Error('blocked'))
    expect(control({ kind: 'where' }, undefined)).toHaveProperty('error')
  })

  it('still cools down after three early exits without spawn errors', async () => {
    const { control } = await import('../src/main/control')
    for (let attempt = 0; attempt < 3; attempt++) {
      control({ kind: 'where' }, undefined)
      latest().stderr.write('PowerShell policy refused the script\n')
      latest().exitCode = 1
      latest().emit('exit', 1, null)
      latest().emit('close', 1, null)
    }
    expect(control({ kind: 'where' }, undefined)).toEqual({ error: 'Windows would not let GeckIt use the mouse and keyboard: PowerShell policy refused the script' })
    expect(started).toHaveLength(3)
  })

  it('reuses a healthy helper, sends physical coordinates and resets the failure count on ready', async () => {
    const { control } = await import('../src/main/control')
    for (let attempt = 0; attempt < 2; attempt++) {
      control({ kind: 'where' }, undefined)
      latest().exitCode = 1
      latest().emit('exit', 1, null)
    }
    control({ kind: 'where' }, undefined)
    latest().stdout.write('ready\n')
    expect(control({ kind: 'move', dx: 0.1, dy: -0.1 }, undefined)).toEqual({ x: 0.6, y: 0.4 })
    expect(latest().stdin.read()?.toString()).toBe('m 600 320\n')
    expect(started).toHaveLength(3)
    latest().exitCode = 1
    latest().emit('exit', 1, null)
    expect(control({ kind: 'where' }, undefined)).not.toHaveProperty('error')
    expect(started).toHaveLength(4)
  })

  it('preserves Mac accessibility permission and osascript input', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const { control } = await import('../src/main/control')
    native.trusted.mockReturnValue(false)
    expect(control({ kind: 'type', text: 'Hi' }, undefined)).toHaveProperty('error')
    expect(started).toHaveLength(0)
    native.trusted.mockReturnValue(true)
    expect(control({ kind: 'type', text: 'Hi' }, undefined)).toEqual({ x: 0.5, y: 0.5 })
    expect(native.spawn.mock.calls[0]?.[0]).toBe('osascript')
    expect(latest().stdin.read()?.toString()).toBe('{"kind":"type","text":"Hi"}\n')
  })
})
