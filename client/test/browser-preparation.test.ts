import { ChildProcess, spawn } from 'node:child_process'
import type * as ChildProcessModule from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import type * as OsModule from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { startCamoufoxPreparation, stopCamoufoxPreparation } from '../src/cli/camoufox'
import { configureCorePlatform, corePlatform } from '../src/core/platform'
import { keepBrowserBridge } from '../src/main/guide'

vi.mock('node:child_process', async (original) => ({ ...await original<typeof ChildProcessModule>(), spawn: vi.fn() }))
vi.mock('node:os', async (original) => { const os = await original<typeof OsModule>(); return { ...os, homedir: vi.fn(os.homedir) } })

afterEach(() => vi.restoreAllMocks())

it('starts preparation on bridge startup without Settings, skips off and shares an active worker', async () => {
  const root = mkdtempSync(join(tmpdir(), 'geckit-browser-preparation-'))
  const before = corePlatform()
  const child = new ChildProcess()
  vi.spyOn(child, 'unref').mockImplementation(() => undefined)
  vi.spyOn(child, 'ref').mockImplementation(() => undefined)
  const kill = vi.spyOn(child, 'kill').mockReturnValue(true)
  const launch = vi.mocked(spawn).mockReturnValue(child)
  vi.mocked(homedir).mockReturnValue(root)
  configureCorePlatform({ directory: () => root, source: () => true, launcher: () => ({ executable: 'node', script: 'cli.js' }) })
  try {
    keepBrowserBridge(false)
    expect(launch).not.toHaveBeenCalled()
    keepBrowserBridge(true)
    expect(launch).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledWith('node', ['cli.js', 'browser-prepare'], expect.objectContaining({ detached: true, stdio: 'ignore' }))
    startCamoufoxPreparation('node', 'cli.js')
    expect(launch).toHaveBeenCalledOnce()
    child.emit('exit', 1)
    startCamoufoxPreparation('node', 'cli.js')
    expect(launch).toHaveBeenCalledTimes(2)
    let stopped = false
    const stopping = stopCamoufoxPreparation().then(() => { stopped = true })
    expect(kill).toHaveBeenCalledWith('SIGTERM')
    await Promise.resolve()
    expect(stopped).toBe(false)
    startCamoufoxPreparation('node', 'cli.js')
    expect(launch).toHaveBeenCalledTimes(2)
    child.emit('exit', 0)
    await stopping
    expect(stopped).toBe(true)
    expect(launch).toHaveBeenCalledTimes(3)
    child.emit('exit', 0)
  } finally {
    keepBrowserBridge(false)
    configureCorePlatform(before)
    rmSync(root, { recursive: true, force: true })
  }
})
