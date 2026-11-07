import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { listenRpc } from '../src/core/rpc'
import { product } from '../src/cli/product'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const dispose of cleanup.splice(0).reverse()) await dispose() })

it('reports an uncertain result after a real authenticated RPC drops a dispatched mutation, without replay', async () => {
  for (const name of ['CODEX_THREAD_ID', 'GECKIT_MANAGER_SESSION', 'CLAUDECODE', 'CLAUDE_SESSION_ID']) vi.stubEnv(name, undefined)
  const folder = await mkdtemp('/private/tmp/gk-product-rpc-')
  cleanup.push(() => rm(folder, { recursive: true, force: true }))
  await writeFile(join(folder, 'operator-token'), 'isolated-token')
  let count = 0
  const server = listenRpc(folder, 'isolated-token', {
    'desktop:hello': () => ({ methods: ['cli:product'] }),
    'cli:product': () => { count++; void server.close(); return new Promise<string>(() => undefined) },
  })
  cleanup.push(server.close)
  await server.ready
  await expect(product(['settings', 'edit', '--patch', '{"theme":"dark"}'], folder)).resolves.toMatchObject({ ok: false, said: expect.stringContaining('Delivery is uncertain') })
  expect(count).toBe(1)
})

it('preserves a definitive application refusal over the same real RPC boundary', async () => {
  for (const name of ['CODEX_THREAD_ID', 'GECKIT_MANAGER_SESSION', 'CLAUDECODE', 'CLAUDE_SESSION_ID']) vi.stubEnv(name, undefined)
  const folder = await mkdtemp('/private/tmp/gk-product-rpc-')
  cleanup.push(() => rm(folder, { recursive: true, force: true }))
  await writeFile(join(folder, 'operator-token'), 'isolated-token')
  const server = listenRpc(folder, 'isolated-token', { 'desktop:hello': () => ({ methods: ['cli:product'] }), 'cli:product': () => { throw new Error('theme changed. Read target state.') } })
  cleanup.push(server.close)
  await server.ready
  await expect(product(['settings', 'edit'], folder)).resolves.toEqual({ ok: false, said: 'theme changed. Read target state.' })
})
