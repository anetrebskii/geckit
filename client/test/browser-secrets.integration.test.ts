import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { makeTestAccount } from '../src/cli/testing'
import { sealFor } from '../src/shared/secret-seal'

interface Reply { readonly ok: boolean; readonly error?: string; readonly result?: { readonly id?: number; readonly lines?: string[]; readonly typed?: string; readonly value?: unknown; readonly png?: string; readonly origin?: string; readonly field?: string; readonly endpointKey?: string; readonly keyId?: string } }
const wait = (ms = 50): Promise<void> => new Promise((done) => setTimeout(done, ms))
let child: ChildProcess | undefined
let server: Server | undefined
let home: string | undefined
const folder = (path: string): string => join(path, '.geckit', 'browser')
const pids = (path: string): number[] => { try { return readdirSync(join(folder(path), 'hosts')).filter((name) => name.endsWith('.json')).map((name) => (JSON.parse(readFileSync(join(folder(path), 'hosts', name), 'utf8')) as { pid: number }).pid) } catch { return [] } }
async function until(check: () => boolean): Promise<void> { for (let tries = 0; tries < 600; tries++) { if (check()) return; await wait() }; throw new Error('Browser state did not arrive.') }
async function ask(path: string, request: object): Promise<Reply> {
  const file = join(folder(path), `${randomUUID()}.${pids(path)[0]}`)
  writeFileSync(`${file}.part`, JSON.stringify(request)); renameSync(`${file}.part`, `${file}.ask`)
  await until(() => existsSync(`${file}.told`))
  const reply = JSON.parse(readFileSync(`${file}.told`, 'utf8')) as Reply
  rmSync(`${file}.told`)
  if (!reply.ok) throw new Error(reply.error)
  return reply
}
afterEach(async () => {
  if (home !== undefined && pids(home).length > 0) await ask(home, { cmd: 'quit' }).catch(() => undefined)
  child?.kill('SIGTERM'); child = undefined
  if (server !== undefined) await new Promise<void>((done) => server?.close(() => done()))
  server = undefined
  if (home !== undefined) rmSync(home, { recursive: true, force: true })
  home = undefined
})

it.skipIf(process.env['GECKIT_CAMOUFOX_INTEGRATION'] !== '1')('never shows a password or a secret field to read, type or eval', async () => {
  server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><title>Secrets</title><form><input aria-label="Email" value="alex@example.com"><input aria-label="Password" type="password" value="pw-canary-4821"><input aria-label="API key" data-geckit-secret value="sk-canary-9931"></form>')
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No local server address.')
  home = mkdtempSync(join(tmpdir(), 'geckit-secrets-live-'))
  makeTestAccount('secrets', 'Secret masking check', home, true)
  child = spawn(process.execPath, [process.env['GECKIT_BROWSER_TEST_CLI'] ?? 'out/service/cli.js', 'browser-test', 'secrets'], { env: { ...process.env, HOME: home, GECKIT_CAMOUFOX: process.env['GECKIT_CAMOUFOX_TEST_BINARY'] ?? '' }, stdio: 'pipe' })
  await until(() => pids(home ?? '').length > 0)
  const tab = (await ask(home, { cmd: 'open', url: `http://127.0.0.1:${address.port}` })).result?.id
  const lines = (await ask(home, { cmd: 'read', tab })).result?.lines ?? []
  const said = lines.join('\n')
  expect(said).toContain('value="alex@example.com"')
  expect(said).not.toContain('pw-canary-4821')
  expect(said).not.toContain('sk-canary-9931')
  expect(said).toMatch(/textbox "Password" secret, filled/)
  expect(said).toMatch(/textbox "API key" secret, filled/)
  const ref = /\[(\d+)\] textbox "Password"/.exec(said)?.[1]
  const typed = (await ask(home, { cmd: 'type', tab, ref, text: 'pw-typed-7710' })).result?.typed
  expect(typed).toBe('secret, filled')
  const value = (await ask(home, { cmd: 'eval', tab, code: '[...document.querySelectorAll("input")].map((one) => one.value).join(" | ")' })).result?.value
  expect(value).toBe('alex@example.com | [secret] | [secret]')
  const shot = await ask(home, { cmd: 'shot', tab })
  expect(shot.result?.png?.length ?? 0).toBeGreaterThan(1000)
  const after = (await ask(home, { cmd: 'eval', tab, code: 'document.getElementById("geckit-secret-hide") === null' })).result?.value
  expect(after).toBe(true)
  const key = (await ask(home, { cmd: 'secret-key', tab, ref })).result
  expect(key?.origin).toBe(`http://127.0.0.1:${address.port}`)
  expect(key?.field).toBe('password')
  const sealed = await sealFor(key?.endpointKey ?? '', 'pw-broker-5512', 'geckit-fill-v1')
  expect((await ask(home, { cmd: 'type-secret', tab, ref, keyId: key?.keyId, sealed })).result?.typed).toBe('secret, filled')
  const filled = (await ask(home, { cmd: 'eval', tab, code: `document.querySelector('[data-geckit-ref="${ref ?? ''}"]').value` })).result?.value
  expect(filled).toBe('[secret]')
  const typedTwice = await ask(home, { cmd: 'type-secret', tab, ref, keyId: key?.keyId, sealed }).catch((error: Error) => error.message)
  expect(typedTwice).toContain('took too long')
}, 120_000)
