import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { URL } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'

const exec = promisify(execFile)
const client = resolve(import.meta.dirname, '../..')
const folder = await mkdtemp('/private/tmp/gk-cli-')
await cp(join(client, 'out/service'), join(folder, 'service'), { recursive: true })
const cliPath = join(folder, 'service/cli.js')
const boxes = new Map()
const signal = createServer(async (request, response) => {
  let body = ''; for await (const part of request) body += part
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  response.setHeader('Content-Type', 'application/json')
  if (path === '/ice') { response.end('{"iceServers":[]}'); return }
  if (request.method === 'PUT') { boxes.set(path, { ...JSON.parse(body), at: Date.now() }); response.end('{}'); return }
  if (path.endsWith('/offers')) { response.end(JSON.stringify([...boxes].filter(([key]) => key.startsWith(`${path}/`)).map(([key, value]) => ({ id: key.split('/').at(-1), box: value.box })))); return }
  response.end(JSON.stringify(boxes.get(path) ?? {}))
})
await new Promise((done) => signal.listen(0, '127.0.0.1', done))
const endpoint = `http://127.0.0.1:${signal.address().port}`
const children = []
const checks = []
async function box(name, providers) {
  const data = join(folder, name, 'data'); const project = join(folder, name, 'project')
  await mkdir(data, { recursive: true }); await mkdir(project)
  await mkdir(join(folder, name, 'codex')); await mkdir(join(folder, name, 'claude')); await mkdir(join(folder, name, 'home'))
  for (const family of ['mcode', 'busy']) {
    const plugin = join(data, 'provider-plugins', `plugin-${family}`)
    await cp(join(client, 'test/fixtures/headless'), plugin, { recursive: true })
    await writeFile(join(plugin, 'index.mjs'), (await readFile(join(plugin, 'index.mjs'), 'utf8')).replaceAll('fixture', family))
    await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: `plugin:${family}`, family: `plugin:${family}`, name: family, shortName: family, icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  }
  await writeFile(join(data, 'settings.json'), JSON.stringify({ projects: [project], chatProviders: providers, chatProvider: 'plugin:mcode', correctProvider: 'plugin:mcode', theme: name === 'source' ? 'dark' : 'light', chromeBridge: false, phone: false, guideClaude: false, guideCodex: false, guidePlugins: { 'plugin:mcode': false, 'plugin:busy': false }, analytics: false, sendErrors: false, analyticsAsked: true, welcomed: true, autoUpdate: false, providerAutoUpdate: false, channelAutoUpdate: false, vpnIpCheck: false }))
  const env = { PATH: process.env.PATH, HOME: join(folder, name, 'home'), TMPDIR: process.env.TMPDIR ?? tmpdir(), LANG: 'en_US.UTF-8', GECKIT_DATA: data, GECKIT_VAULT_KEY: randomBytes(32).toString('base64'), CODEX_HOME: join(folder, name, 'codex'), CLAUDE_CONFIG_DIR: join(folder, name, 'claude') }
  const cli = async (...args) => (await exec(process.execPath, [cliPath, ...args], { env, timeout: 45000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim()
  const child = spawn(process.execPath, [join(folder, 'service/service.js'), '--data', data], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  let output = ''; child.stdout.on('data', (part) => { output += part }); child.stderr.on('data', (part) => { output += part })
  for (let at = 0; at < 300; at++) { if (output.includes('service ready.')) return { data, project, env, cli }; if (child.exitCode !== null) throw new Error(`Isolated ${name} service exited: ${output}`); await delay(50) }
  throw new Error(`Isolated ${name} service did not start: ${output}`)
}
async function denied(run, pattern) {
  await assert.rejects(run, (error) => pattern.test(`${error.stdout}\n${error.stderr}\n${error.message}`))
}
try {
  const source = await box('source', ['plugin:mcode'])
  const target = await box('target', ['claude', 'codex', 'plugin:mcode', 'plugin:busy'])
  await target.cli('access', 'enable', '--signal', endpoint)
  const code = await target.cli('pair')
  await source.cli('computers', 'add', code)
  const computers = JSON.parse(await source.cli('service', 'call', 'computers:list', '[]'))
  const host = computers[0].id
  const remote = (...args) => source.cli(...args, '--host', host)
  const caps = JSON.parse(await remote('capabilities'))
  assert.equal(caps.authority, 'operator'); assert(caps.commands.length > 20)
  assert.equal(JSON.parse(await source.cli('settings', 'show')).theme, 'dark')
  assert.equal(JSON.parse(await remote('settings', 'show')).theme, 'light')
  await remote('settings', 'edit', '--patch', '{"theme":"dark"}', '--expected', '{"theme":"light"}')
  await denied(() => remote('settings', 'edit', '--patch', '{"theme":"light"}', '--expected', '{"theme":"light"}'), /changed/)
  assert.equal(JSON.parse(await remote('settings', 'show')).theme, 'dark')
  await denied(() => source.cli('settings', 'edit', '--patch', '{"theme":"light"}', '--host', 'does-not-exist'), /No paired computer/)
  assert.equal(JSON.parse(await source.cli('settings', 'show')).theme, 'dark')
  checks.push('source/target separation, remote read/write, expected-value conflict and unknown-host no-fallback')
  const active = JSON.parse(await remote('sessions', 'start', '--project', target.project, '--provider', 'plugin:busy', '--text', 'hang'))
  await denied(() => remote('providers', 'disable', '--provider', 'plugin:busy', '--expected', '["claude","codex","plugin:mcode","plugin:busy"]'), /active, held or queued/)
  await remote('sessions', 'stop', '--id', active.id)
  await delay(100)
  await remote('sessions', 'release', '--id', active.id)
  await delay(100)
  await remote('providers', 'disable', '--provider', 'plugin:busy', '--expected', '["claude","codex","plugin:mcode","plugin:busy"]')
  await remote('providers', 'disable', '--provider', 'claude', '--expected', '["claude","codex","plugin:mcode"]')
  await remote('providers', 'disable', '--provider', 'codex', '--expected', '["codex","plugin:mcode"]')
  assert.deepEqual(JSON.parse(await remote('settings', 'show')).chatProviders, ['plugin:mcode'])
  assert.deepEqual(JSON.parse(await source.cli('settings', 'show')).chatProviders, ['plugin:mcode'])
  checks.push('synthetic MCode-only, held-work refusal, stop/release and no implicit provider fallback')
  await denied(() => remote('sessions', 'retry', '--id', active.id), /enabled provider/)
  await denied(() => remote('sessions', 'proceed', '--id', active.id), /enabled provider/)
  await denied(() => remote('sessions', 'transport', '--id', active.id, '--transport', 'tmux'), /enabled provider|unavailable/)
  await denied(() => remote('shortcuts', 'save', '--draft', JSON.stringify({ name: 'Bad cron', root: target.project, prompt: 'noop', mode: 'manual', on: false, provider: 'plugin:mcode', cron: 'invalid' }), '--expected', 'null'), /cron/)
  checks.push('disabled provider history cannot restart through retry/proceed; unsupported transport and invalid cron fail')
  const mcode = JSON.parse(await remote('sessions', 'start', '--project', target.project, '--provider', 'plugin:mcode', '--text', 'hello'))
  await delay(100)
  const history = JSON.parse(await source.cli('sessions', '--json', '--host', host))
  assert(history.some((one) => one.id === mcode.id))
  const shown = JSON.parse(await source.cli('show', mcode.id, '--json', '--computer', host))
  assert.equal(shown.provider, 'plugin:mcode')
  checks.push('legacy sessions/show plugin history and --computer compatibility over real relay')
  const description = join(folder, 'origin-description.txt'); await writeFile(description, 'Read on originating computer')
  await remote('employees', 'create', '--name', 'Isolated employee', '--description-file', description)
  assert(JSON.parse(await remote('employees', 'list')).employees.some((one) => one.description === 'Read on originating computer'))
  checks.push('employee source-file expansion through typed remote dispatcher')
  await denied(() => exec(process.execPath, [cliPath, 'providers', 'disable', '--provider', 'plugin:mcode', '--expected', '["plugin:mcode"]', '--host', host], { env: { ...source.env, CODEX_THREAD_ID: 'test-worker' } }), /Operator access denied/)
  await denied(() => target.cli('service', 'call', 'cli:product', JSON.stringify([['sessions', 'stop', '--id', active.id], 'manager'])), /./)
  checks.push('worker cannot use operator configuration and Manager authority cannot mutate unowned target sessions')
  await denied(() => remote('channels', 'configure', '--id', 'channel:slack', '--patch', '{"secrets":{"token":"not-a-secret"}}', '--expected', '{"enabled":false}'), /Native credentials|native|not installed/)
  const tokenPath = join(source.data, 'operator-token'); const token = await readFile(tokenPath, 'utf8')
  try {
    await writeFile(tokenPath, 'invalid-test-token')
    await denied(() => source.cli('capabilities'), /auth|token|denied|closed/i)
  } finally { await writeFile(tokenPath, token) }
  checks.push('native secret patch rejected and actual RPC bearer authentication failure')
  const result = { fixture: folder, transport: 'real authenticated RPC + encrypted local-signaling WebRTC between disposable Node services', checks, unverified: ['physical remote computer', 'managed Firebase/TURN/NAT', 'interactive native authorizations', 'authenticated model accounts'] }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
} finally {
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(children.map((child) => child.exitCode !== null ? undefined : new Promise((done) => child.once('exit', done))))
  signal.closeAllConnections(); await new Promise((done) => signal.close(done))
}
