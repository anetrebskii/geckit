import { spawn, execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { canStartService, ownDataDirectory } from '../src/core/ownership'
import { listenRpc } from '../src/core/rpc'
import { connectDesktop } from '../src/main/service-client'
import type { DesktopServiceClient } from '../src/main/service-client'

const exec = promisify(execFile)
const root = mkdtempSync(join(tmpdir(), 'geckit-recovery-tests-'))
const cleanup: (() => void | Promise<void>)[] = []
let deadPid: number

beforeAll(async () => {
  const child = await exec(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { windowsHide: true })
  deadPid = Number(child.stdout)
  expect(() => process.kill(deadPid, 0)).toThrow()
  await build({
    configFile: false, logLevel: 'error',
    build: {
      ssr: true, target: 'node22', outDir: root, emptyOutDir: false,
      rollupOptions: {
        input: { service: resolve('test/fixtures/recovery-service.ts'), 'service-start': resolve('src/cli/service-start.ts') },
        output: { format: 'es', entryFileNames: '[name].js' },
      },
    },
  })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

function directory(): string { return mkdtempSync(join(root, 'data-')) }
function stale(path: string, owner = true, token = true): void {
  if (owner) writeFileSync(join(path, 'service-owner.json'), JSON.stringify({ pid: deadPid, token: 'previous-owner' }))
  if (token) writeFileSync(join(path, 'operator-token'), 'previous-token')
}
function pid(path: string): number { return (JSON.parse(readFileSync(join(path, 'service-owner.json'), 'utf8')) as { pid: number }).pid }

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
}

async function start(path: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, [join(root, 'service.js'), '--data', path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  cleanup.push(() => stop(child))
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString() })
  await vi.waitFor(() => { expect(child.exitCode, output).toBe(null); expect(output).toContain('recovery fixture ready') }, { timeout: 5_000 })
  return child
}

async function desktop(path: string): Promise<DesktopServiceClient> {
  // Register cleanup before startup so a failed assertion cannot leave a fixture running.
  cleanup.push(async () => {
    if (!existsSync(join(path, 'service-owner.json'))) return
    const owner = pid(path)
    if (owner === process.pid || owner === deadPid) return
    try { process.kill(owner, 'SIGKILL') } catch { return }
    await vi.waitFor(() => expect(() => process.kill(owner, 0)).toThrow(), { timeout: 5_000 })
  })
  const client = await connectDesktop({ directory: path, executable: process.execPath, script: join(root, 'service.js'), onEvent: () => undefined })
  cleanup.push(() => { client.close() })
  return client
}

it('allows the CLI to start without an owner even when an old token remains', () => {
  const path = directory()
  stale(path, false, true)
  expect(canStartService(path)).toBe(true)
  expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe('previous-token')
})

it.skipIf(process.platform === 'win32')('preserves manual recovery for an existing owner on other platforms', () => {
  const path = directory()
  stale(path)
  expect(canStartService(path)).toBe(false)
  expect(pid(path)).toBe(deadPid)
})

describe.skipIf(process.platform !== 'win32')('Windows service recovery', () => {
  it.each([[true, true], [true, false], [false, true]])('recovers stopped owner=%s token=%s without changing settings or history', async (owner, token) => {
    const path = directory()
    stale(path, owner, token)
    writeFileSync(join(path, 'settings.json'), '{"theme":"dark"}')
    writeFileSync(join(path, 'sessions.json'), '{"fixture":"keep"}')
    expect(canStartService(path)).toBe(true)
    const client = await desktop(path)
    expect(client.snapshot.name).toBe('Recovered fixture')
    expect(pid(path)).not.toBe(deadPid)
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).not.toBe('previous-token')
    expect(readFileSync(join(path, 'settings.json'), 'utf8')).toBe('{"theme":"dark"}')
    expect(readFileSync(join(path, 'sessions.json'), 'utf8')).toBe('{"fixture":"keep"}')
  })

  it('recovers after an actual process is killed without running cleanup', async () => {
    const path = directory()
    const previous = await start(path)
    const oldToken = readFileSync(join(path, 'operator-token'), 'utf8')
    await stop(previous)
    expect(existsSync(join(path, 'service-owner.json'))).toBe(true)
    expect(canStartService(path)).toBe(true)
    const client = await desktop(path)
    expect(client.connected).toBe(true)
    expect(pid(path)).not.toBe(previous.pid)
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).not.toBe(oldToken)
  })

  it('lets two desktop launches attach to a single recovered owner', async () => {
    const path = directory()
    stale(path)
    const clients = await Promise.all([desktop(path), desktop(path)])
    expect(clients.every((client) => client.connected)).toBe(true)
    expect(readFileSync(join(path, 'owners.log'), 'utf8').trim().split('\n')).toHaveLength(1)
  })

  it('keeps a live owner and its credentials when a second service starts', async () => {
    const path = directory()
    await start(path)
    const identity = readFileSync(join(path, 'service-owner.json'), 'utf8')
    const token = readFileSync(join(path, 'operator-token'), 'utf8')
    expect(canStartService(path)).toBe(false)
    await expect(ownDataDirectory(path)).rejects.toThrow('already running')
    const client = await desktop(path)
    expect(client.connected).toBe(true)
    expect(readFileSync(join(path, 'service-owner.json'), 'utf8')).toBe(identity)
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe(token)
  })

  it('holds exclusive ownership even if its metadata has been removed', async () => {
    const path = directory()
    const release = await ownDataDirectory(path)
    cleanup.push(release)
    rmSync(join(path, 'service-owner.json'))
    await expect(ownDataDirectory(path)).rejects.toThrow('already running')
  })

  it.each(['{', '{}', '{"pid":0}', '{"pid":-1}'])('preserves unverifiable owner metadata %s', async (identity) => {
    const path = directory()
    writeFileSync(join(path, 'service-owner.json'), identity)
    writeFileSync(join(path, 'operator-token'), 'keep-token')
    expect(canStartService(path)).toBe(false)
    await expect(ownDataDirectory(path)).rejects.toThrow('could not be verified')
    expect(readFileSync(join(path, 'service-owner.json'), 'utf8')).toBe(identity)
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe('keep-token')
  })

  it('preserves a live legacy process that does not hold the new pipe', async () => {
    const path = directory()
    writeFileSync(join(path, 'service-owner.json'), JSON.stringify({ pid: process.pid }))
    writeFileSync(join(path, 'operator-token'), 'keep-token')
    expect(canStartService(path)).toBe(false)
    await expect(ownDataDirectory(path)).rejects.toThrow('already running')
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe('keep-token')
  })

  it('does not treat denied process access as a stopped owner', async () => {
    const path = directory()
    stale(path)
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('access denied'), { code: 'EPERM' }) })
    expect(canStartService(path)).toBe(false)
    await expect(ownDataDirectory(path)).rejects.toThrow('could not be verified')
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe('previous-token')
  })

  it('preserves a reachable service even when its owner metadata is missing', async () => {
    const path = directory()
    writeFileSync(join(path, 'operator-token'), 'keep-token')
    const server = listenRpc(path, 'keep-token', {})
    cleanup.push(server.close)
    await server.ready
    await expect(ownDataDirectory(path)).rejects.toThrow('socket already exists')
    expect(readFileSync(join(path, 'operator-token'), 'utf8')).toBe('keep-token')
    expect(existsSync(join(path, 'service-owner.json'))).toBe(false)
  })

  it('allows reacquisition after a clean release', async () => {
    const path = directory()
    const release = await ownDataDirectory(path)
    expect(canStartService(path)).toBe(false)
    await release()
    await release()
    expect(canStartService(path)).toBe(true)
    const nextRelease = await ownDataDirectory(path)
    await nextRelease()
  })

  it.each([1, 2])('recovers through %i CLI launcher(s) and keeps read-only calls read-only', async (launchers) => {
    const path = directory()
    stale(path)
    const module = JSON.stringify(pathToFileURL(join(root, 'service-start.js')).href)
    const data = JSON.stringify(path)
    await expect(exec(process.execPath, ['--input-type=module', '-e', `const {connectService}=await import(${module}); await connectService(${data},false)`], { windowsHide: true })).rejects.toThrow()
    expect(pid(path)).toBe(deadPid)
    cleanup.push(async () => {
      const owner = pid(path)
      if (owner === deadPid) return
      try { process.kill(owner, 'SIGKILL') } catch { return }
      await vi.waitFor(() => expect(() => process.kill(owner, 0)).toThrow(), { timeout: 5_000 })
    })
    const results = await Promise.all(Array.from({ length: launchers }, () => exec(process.execPath, ['--input-type=module', '-e', `const {connectService}=await import(${module}); const c=await connectService(${data},true); console.log(await c.call('probe:pid'));c.close()`], { windowsHide: true, timeout: 10_000 })))
    for (const result of results) expect(Number(result.stdout)).toBe(pid(path))
    expect(readFileSync(join(path, 'owners.log'), 'utf8').trim().split('\n')).toHaveLength(1)
    expect(pid(path)).not.toBe(deadPid)
  })
})
