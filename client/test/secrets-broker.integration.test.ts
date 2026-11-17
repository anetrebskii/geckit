import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { brokerOps, type SecretLifetime } from '../src/core/broker'
import { Secrets } from '../src/core/secrets'
import { receiver, sealFor, keyHashOf, type SealedValue } from '../src/shared/secret-seal'
import { brokerPath, superviseBroker, type BrokerProcess } from '../src/service/broker-process'

const CANARY = 'canary-7f3c9a2e-5b1d-secret'
const run = process.env['GECKIT_BROKER_INTEGRATION'] === '1'
let folder = ''
let broker: BrokerProcess | undefined

interface Held { card: { brokerKey: string }; state: string; ciphertext?: SealedValue; lifetime?: SecretLifetime; user?: string }
const relayed = new Map<string, Held>()
const relay = async (body: object): Promise<{ status: number; json: Record<string, unknown> }> => {
  const ask = body as { action: string; id: string; card?: Held['card']; ciphertext?: SealedValue; lifetime?: SecretLifetime }
  if (ask.action === 'open') { relayed.set(ask.id, { card: ask.card as Held['card'], state: 'sent' }); return { status: 200, json: { expiresAt: Date.now() + 900_000 } } }
  const held = relayed.get(ask.id)
  if (held === undefined) return { status: 404, json: { error: 'not-valid' } }
  if (held.state !== 'saved') return { status: 200, json: { state: held.state } }
  held.state = 'collected'
  return { status: 200, json: { state: 'saved', ciphertext: held.ciphertext, lifetime: held.lifetime, user: held.user ?? '', device: 'test page' } }
}
const page = async (link: string, value: string, lifetime: SecretLifetime, user?: string): Promise<void> => {
  const [id, , keyHash] = link.split('#')[1]?.split('.') ?? []
  const held = relayed.get(id ?? '')
  if (held === undefined) throw new Error('no card')
  expect(await keyHashOf(held.card.brokerKey)).toBe(keyHash)
  held.ciphertext = await sealFor(held.card.brokerKey, value, 'geckit-secret-v1')
  held.lifetime = lifetime
  if (user !== undefined) held.user = user
  held.state = 'saved'
}
const until = async (check: () => Promise<boolean>): Promise<void> => { for (let tries = 0; tries < 200; tries++) { if (await check()) return; await new Promise((done) => setTimeout(done, 100)) } throw new Error('timed out') }

beforeAll(async () => {
  if (!run) return
  folder = mkdtempSync(join(tmpdir(), 'geckit-broker-'))
  process.env['GECKIT_BROKER_DIR'] = folder
  const path = brokerPath(join(import.meta.dirname, '..'))
  if (path === undefined) throw new Error('Build the broker first: scripts/broker.sh')
  broker = superviseBroker({ source: true, path, signed: false })
  await until(async () => broker?.state().running === true)
})
afterAll(async () => {
  if (!run) return
  await brokerOps(() => broker!.endpoint()).revoke({ all: true }).catch(() => undefined)
  broker?.stop()
  delete process.env['GECKIT_BROKER_DIR']
  rmSync(folder, { recursive: true, force: true })
})

it.skipIf(!run)('takes a secret from the page, uses it without giving it out, and forgets it with its task', async () => {
  const ops = brokerOps(() => broker!.endpoint())
  const notices: string[] = []
  const secrets = new Secrets({ broker: () => ops, notify: (_task, title, body) => { notices.push(`${title}: ${body}`) }, relay, computer: () => 'test-mac' })

  const made = await secrets.request({ name: 'canary-cmd', kind: 'command', places: ['sh'], note: 'canary', taskId: 'task-a', taskTitle: 'Canary task' })
  expect(made.link).toMatch(/\/s\/#[\w-]{22}\.[\w-]{22}\.[\w-]{22}$/)
  await page(made.link ?? '', CANARY, 'task')
  await until(async () => (await ops.list()).secrets.some((one) => one.name === 'canary-cmd'))
  expect(notices.join('\n')).toContain('canary-cmd is ready')
  expect(notices.join('\n')).not.toContain(CANARY)

  let out = ''
  const done = await ops.run({ taskId: 'task-a', secrets: [], env: ['TOKEN=secret:canary-cmd'], argv: ['sh', '-c', 'echo "plain $TOKEN"; printf %s "$TOKEN" | base64; printf %s "$TOKEN" | xxd -p'], cwd: folder }, (chunk) => { out += Buffer.from(chunk.out ?? '', 'base64').toString() })
  expect(done.exit).toBe(0)
  expect(out).toContain('plain [secret:canary-cmd]')
  expect(out).not.toContain(CANARY)
  expect(out).not.toContain(Buffer.from(CANARY).toString('base64'))
  expect(out).not.toContain(Buffer.from(CANARY).toString('hex'))

  await expect(ops.run({ taskId: 'task-a', secrets: [], env: ['TOKEN=secret:canary-cmd'], argv: ['bash', '-c', 'echo $TOKEN'], cwd: folder }, () => undefined)).rejects.toThrow(/sh|program/)
  await expect(ops.run({ taskId: 'task-b', secrets: [], env: ['TOKEN=secret:canary-cmd'], argv: ['sh', '-c', 'echo $TOKEN'], cwd: folder }, () => undefined)).rejects.toThrow()

  const site = await secrets.request({ name: 'canary-site', kind: 'website', places: ['https://example.com'], user: 'alex@example.com', taskId: 'task-a' })
  expect(relayed.get(site.link?.split('#')[1]?.split('.')[0] ?? '')?.card).toMatchObject({ user: 'alex@example.com' })
  await page(site.link ?? '', CANARY, 'once')
  await until(async () => (await ops.list()).secrets.some((one) => one.name === 'canary-site'))
  expect((await ops.list()).secrets.find((one) => one.name === 'canary-site')?.user).toBe('alex@example.com')

  const typedOnPage = await secrets.request({ name: 'canary-site-typed', kind: 'website', places: ['https://example.com'], taskId: 'task-a' })
  await page(typedOnPage.link ?? '', CANARY, 'once', 'typed@example.com')
  await until(async () => (await ops.list()).secrets.some((one) => one.name === 'canary-site-typed'))
  expect((await ops.list()).secrets.find((one) => one.name === 'canary-site-typed')?.user).toBe('typed@example.com')
  expect(notices.join('\n')).toContain('as typed@example.com')
  await ops.revoke({ name: 'canary-site-typed' })
  await expect(ops.fill({ name: 'canary-site', taskId: 'task-a', origin: 'https://evil.example', field: 'password', endpointKey: (await receiver()).publicKey })).rejects.toThrow()
  const endpoint = await receiver()
  const sealed = await ops.fill({ name: 'canary-site', taskId: 'task-a', origin: 'https://example.com', field: 'password', endpointKey: endpoint.publicKey })
  expect(await endpoint.open(sealed.sealed, 'geckit-fill-v1')).toBe(CANARY)
  await until(async () => !(await ops.list()).secrets.some((one) => one.name === 'canary-site'))

  expect((await ops.clean({ text: `x ${CANARY} y` })).text).toBe('x [secret:canary-cmd] y')
  expect((await ops.taskEnded({ taskId: 'task-a' })).removed).toBe(1)
  expect((await ops.list()).secrets).toEqual([])

  const files = readdirSync(folder, { recursive: true, encoding: 'utf8' }).map((one) => join(folder, one)).filter((one) => statSync(one).isFile())
  for (const file of files) expect(readFileSync(file).includes(Buffer.from(CANARY)), file).toBe(false)
  secrets.dispose()
}, 60_000)

it.skipIf(!run)('adds a secret from Settings, changes where it is used and keeps its value', async () => {
  const ops = brokerOps(() => broker!.endpoint())
  const secrets = new Secrets({ broker: () => ops, notify: () => undefined, relay, computer: () => 'test-mac' })
  const entry = { name: 'settings-cmd', kind: 'command' as const, places: ['sh'], note: 'from Settings', user: 'ignored-for-command', lifetime: 'keep' as const, editing: false }

  const ready = await secrets.prepareEntry(entry)
  await secrets.saveEntry(ready.requestId, await sealFor(ready.brokerKey, CANARY, 'geckit-secret-v1'), 'keep')
  const saved = (await ops.list()).secrets.find((one) => one.name === 'settings-cmd')
  expect(saved).toMatchObject({ kind: 'command', places: ['sh'], note: 'from Settings', lifetime: 'keep' })
  expect(saved?.user).toBeUndefined()
  await expect(secrets.prepareEntry(entry)).rejects.toThrow('A secret named settings-cmd already exists. Edit it instead.')
  await expect(secrets.updateEntry({ ...entry, kind: 'http', places: ['api.example.com'] })).rejects.toThrow(/remove it and add it again/)
  await expect(secrets.updateEntry({ ...entry, lifetime: 'task' })).rejects.toThrow(/belongs to no conversation/)

  await secrets.updateEntry({ ...entry, places: ['bash'], note: '', lifetime: '1h' })
  const changed = (await ops.list()).secrets.find((one) => one.name === 'settings-cmd')
  expect(changed?.places).toEqual(['bash'])
  expect(changed?.note).toBeUndefined()
  expect(changed?.expiresAt).toBeGreaterThan(Date.now() + 59 * 60_000)

  let out = ''
  const done = await ops.run({ taskId: 'any', secrets: [], env: ['TOKEN=secret:settings-cmd'], argv: ['bash', '-c', 'test "$TOKEN" = "' + CANARY + '" && echo same'], cwd: folder }, (chunk) => { out += Buffer.from(chunk.out ?? '', 'base64').toString() })
  expect(done.exit).toBe(0)
  expect(out).toContain('same')
  await expect(ops.run({ taskId: 'any', secrets: [], env: ['TOKEN=secret:settings-cmd'], argv: ['sh', '-c', 'echo $TOKEN'], cwd: folder }, () => undefined)).rejects.toThrow()
  await expect(secrets.updateEntry({ ...entry, name: 'no-such-secret' })).rejects.toThrow('There is no secret no-such-secret.')

  const site = { name: 'settings-site', kind: 'website' as const, places: ['https://example.com'], note: '', user: 'alex@example.com', lifetime: 'keep' as const, editing: false }
  const opened = await secrets.prepareEntry(site)
  await secrets.saveEntry(opened.requestId, await sealFor(opened.brokerKey, CANARY, 'geckit-secret-v1'), 'keep')
  expect((await ops.list()).secrets.find((one) => one.name === 'settings-site')?.user).toBe('alex@example.com')
  await secrets.updateEntry({ ...site, user: 'alex-work' })
  expect((await ops.list()).secrets.find((one) => one.name === 'settings-site')?.user).toBe('alex-work')
})
