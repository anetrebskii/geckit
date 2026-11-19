import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { displayFrom, MISSING_XVFB, startVirtualDisplay, stopStale, xvfbArgs } from '../src/cli/virtual-display'

const fake = (plan: (child: EventEmitter & { stdio: PassThrough[]; stderr: PassThrough }) => void): typeof spawn => (() => {
  const child = Object.assign(new EventEmitter(), { pid: 4242, exitCode: null, kill: () => true, stdio: [new PassThrough(), new PassThrough(), new PassThrough(), new PassThrough()], stderr: new PassThrough() })
  setTimeout(() => plan(child), 5)
  return child
}) as unknown as typeof spawn

describe('virtual display', () => {
  it('lets Xvfb choose a free display, off the network', () => {
    expect(xvfbArgs({ width: 1920, height: 1080 })).toEqual(['-displayfd', '3', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp', '-noreset'])
    expect(displayFrom('99\n')).toBe(':99')
    expect(displayFrom('')).toBeUndefined()
  })

  it('starts, notes its pid and stops', async () => {
    const pidFile = join(mkdtempSync(join(tmpdir(), 'geckit-xvfb-')), 'locks', 'p.xvfb')
    const display = await startVirtualDisplay({ width: 800, height: 600 }, pidFile, fake((child) => child.stdio[3]?.write('12\n')))
    expect(display.display).toBe(':12')
    expect(readFileSync(pidFile, 'utf8')).toBe('4242')
    display.stop()
    expect(existsSync(pidFile)).toBe(false)
  })

  it('names the package when Xvfb is not installed', async () => {
    const missing = fake((child) => child.emit('error', Object.assign(new Error('spawn Xvfb ENOENT'), { code: 'ENOENT' })))
    await expect(startVirtualDisplay({ width: 1, height: 1 }, join(tmpdir(), 'none.xvfb'), missing)).rejects.toThrow(MISSING_XVFB)
  })

  it('quotes Xvfb when it ends before saying its display', async () => {
    const ended = fake((child) => { child.stderr.write('(EE) Server is already active for display 0\n'); setTimeout(() => child.emit('exit', 1), 5) })
    await expect(startVirtualDisplay({ width: 1, height: 1 }, join(tmpdir(), 'none.xvfb'), ended)).rejects.toThrow('The virtual display did not start: (EE) Server is already active for display 0.')
  })

  it('stops only an Xvfb left by a driver that did not close cleanly', () => {
    const pidFile = join(mkdtempSync(join(tmpdir(), 'geckit-xvfb-')), 'p.xvfb')
    writeFileSync(pidFile, String(process.pid))
    stopStale(pidFile, () => false)
    expect(existsSync(pidFile)).toBe(false)
  })
})
