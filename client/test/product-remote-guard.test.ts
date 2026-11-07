import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type * as ComputerCli from '../src/cli/computer'
import type { RemoteChannel, RemoteSignal } from '../src/shared/remote/protocol'
import type { ObservationRuntime } from '../src/service/remote/gateway'

const transport = vi.hoisted(() => ({ joined: undefined as ((channel: RemoteChannel) => void) | undefined, dial: undefined as (() => Promise<RemoteChannel>) | undefined, calls: 0 }))
vi.mock('../src/service/remote/transport', () => ({ nodeListen: (_pairing: RemoteSignal, joined: (channel: RemoteChannel) => void) => { transport.joined = joined; return () => undefined }, nodeDial: () => transport.dial?.(), disposeTransport: () => undefined }))
vi.mock('../src/cli/computer', async (original) => ({ ...await original<typeof ComputerCli>(), noteComputers: () => undefined }))
vi.mock('../src/main/store', () => ({ getSettings: () => ({ projects: [], profiles: [] }) }))
vi.mock('../src/core/application', () => ({ application: () => ({ 'cli:product': () => { transport.calls++; return 'dispatched' } }) }))

import { remoteComputers } from '../src/service/remote/computers'
import { remoteAccess } from '../src/service/remote/access'
import { serviceSecurity } from '../src/service/application'
import { coreEvents } from '../src/core/events'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'

const cleanup: (() => void)[] = []
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); transport.calls = 0; transport.dial = undefined; transport.joined = undefined })
function channels(): RemoteChannel {
  const buffers: string[][] = [[], []]
  const listeners: (((text: string) => void) | undefined)[] = []
  const closers: (() => void)[] = []
  let closed = false
  const side = (index: number): RemoteChannel => ({
    binding: Promise.resolve('isolated-bound-channel'),
    send: (text) => { const opposite = 1 - index; queueMicrotask(() => { const hear = listeners[opposite]; if (hear) hear(text); else buffers[opposite]?.push(text) }) },
    onMessage: (hear) => { listeners[index] = hear; for (const text of buffers[index]?.splice(0) ?? []) hear(text) },
    onClose: (close) => { closers.push(close) },
    close: () => { if (closed) return; closed = true; for (const close of closers) close() },
  })
  transport.joined?.(side(0))
  return side(1)
}

it('rechecks revoked Manager authorization after dialing and never dispatches a core call', async () => {
  const folder = mkdtempSync('/private/tmp/gk-product-guard-')
  cleanup.push(() => rmSync(folder, { recursive: true, force: true }))
  const runtime: ObservationRuntime = { sessions: { list: async () => [], items: async () => [] }, manager: { view: async () => ({ config: DEFAULT_MANAGER_CONFIG, state: 'off', workers: [], activity: [], providers: [], decisions: [], queued: 0 }), inspect: async (id) => ({ id, items: [] }) }, subscribe: coreEvents().subscribe }
  const key = { key: Buffer.alloc(32, 97).toString('base64') }
  const target = await remoteAccess(runtime, join(folder, 'target'), serviceSecurity(join(folder, 'target'), key))
  cleanup.push(target.dispose)
  await target.enable('http://127.0.0.1:47932')
  transport.dial = async () => channels()
  const source = remoteComputers(join(folder, 'source'), serviceSecurity(join(folder, 'source'), key))
  cleanup.push(source.dispose)
  await source.add((await target.pair()).code)
  const id = source.list()[0]?.id
  if (id === undefined) throw new Error('No registered test target')
  source.dispose()
  const returning = remoteComputers(join(folder, 'source'), serviceSecurity(join(folder, 'source'), key))
  cleanup.push(returning.dispose)
  let resume: (() => void) | undefined
  transport.dial = () => new Promise<RemoteChannel>((done) => { resume = () => done(channels()) })
  let allowed = true
  const rejected = expect(returning.product(id, ['settings', 'edit', '--patch', '{"theme":"dark"}'], () => allowed, 'manager')).rejects.toThrow('no longer authorized')
  allowed = false
  await vi.waitFor(() => expect(resume).toBeDefined())
  resume?.()
  await rejected
  expect(transport.calls).toBe(0)
})
