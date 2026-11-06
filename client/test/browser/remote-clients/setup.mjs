import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { URL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const client = resolve(import.meta.dirname, '../../..')
const folder = await mkdtemp(join(tmpdir(), 'geckit-remote-e2e-'))
const directory = join(folder, 'data')
const project = join(folder, 'Remote workspace')
const hidden = join(folder, 'Private project')
await mkdir(project); await mkdir(hidden)
await cp(join(client, 'out/service'), join(folder, 'service'), { recursive: true })
const plugin = join(directory, 'provider-plugins/plugin-fixture')
await cp(join(client, 'test/fixtures/headless'), plugin, { recursive: true })
await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ projects: [project, hidden], chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', chatModel: 'fixture', vpnIpCheck: false, guideClaude: false, guideCodex: false, providerAutoUpdate: false, channelAutoUpdate: false, analytics: false, analyticsAsked: true, welcomed: true }))
await writeFile(join(directory, 'fixture-history.json'), JSON.stringify([
  { id: 'plugin:fixture:manager-history', root: project, title: 'Manager fixture history', at: Date.now(), stands: 'Manager record', driven: false, items: [{ id: 'manager-note', kind: 'theirs', text: 'Stored Manager history from the isolated server', at: Date.now() }] },
  { id: 'plugin:fixture:remote-real-history', root: project, title: 'Remote server conversation', at: Date.now(), stands: 'Read from the isolated service provider history', driven: false, items: Array.from({ length: 125 }, (_, i) => ({ id: `message-${i}`, kind: i % 2 === 0 ? 'mine' : 'theirs', text: `Recorded message ${i}: actual service history`, at: Date.now() })) },
  { id: 'plugin:fixture:hidden', root: hidden, title: 'PRIVATE must never cross scope', at: Date.now(), stands: 'Private', driven: false, items: [] },
]))
await writeFile(join(directory, 'manager.json'), JSON.stringify({ config: { enabled: false, provider: 'plugin:fixture', instructions: '', delegation: 'approve' }, sessionId: 'plugin:fixture:manager-history', paused: true, inbox: [], receipts: [], operations: [], decisions: [], workerEvents: [], threads: [] }))
const env = { ...process.env, GECKIT_DATA: directory, GECKIT_VAULT_KEY: randomBytes(32).toString('base64'), HOME: join(folder, 'home'), CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') }
for (const key of ['CODEX_THREAD_ID','GECKIT_SESSION','CLAUDE_CODE_SESSION_ID','GECKIT_MANAGER_SESSION','GECKIT_MANAGER_TOKEN','GECKIT_MANAGER_OPERATION','CLAUDECODE','GECKIT_SOURCE_CLI']) delete env[key]
const cli = async (...args) => {
  const result = await exec(process.execPath, [join(folder, 'service/cli.js'), ...args], { env, timeout: 30000 })
  return result.stdout
}
let child
async function start() {
  child = spawn(process.execPath, [join(folder, 'service/cli.js'), 'service', 'run', '--data', directory], { env, stdio: ['ignore','pipe','pipe'] })
  let output = ''
  child.stdout.on('data', (text) => { output += text; console.log(String(text).trim()) })
  child.stderr.on('data', (text) => console.error(String(text).trim()))
  for (let i = 0; i < 300; i++) { if (output.includes('service ready.')) return; if (child.exitCode !== null) throw new Error('Service exited'); await setTimeout(50) }
  throw new Error('Service did not start')
}
const boxes = new Map()
let invitation
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') { response.end(); return }
  let body = ''; for await (const part of request) { body += part; if (body.length > 100000) { response.writeHead(413).end(); return } }
  const url = new URL(request.url, 'http://127.0.0.1')
  response.setHeader('Content-Type', 'application/json')
  try {
    if (url.pathname === '/invitation') { response.end(JSON.stringify(invitation)); return }
    if (url.pathname === '/ice') { response.end('{"iceServers":[]}'); return }
    if (url.pathname === '/pending') { response.end(await cli('pair', 'pending')); return }
    if (url.pathname === '/approve') { const pending = JSON.parse(await cli('pair','pending')); for (const one of pending) await cli('pair','approve',one.id,'--phrase',one.phrase); response.end('{"approved":true}'); return }
    if (url.pathname === '/devices') { response.end(await cli('devices','list')); return }
    if (url.pathname === '/revoke') { const devices = JSON.parse(await cli('devices','list')); const one = devices.find((one) => !one.revoked); if (one) await cli('devices','revoke',one.id); response.end('{"revoked":true}'); return }
    if (url.pathname === '/restart') { const exited = new Promise((done) => child.once('exit',done)); await cli('service','shutdown'); await exited; await start(); response.end('{"restarted":true}'); return }
    if (url.pathname === '/event') { await cli('service','call','chat:rename',JSON.stringify(['plugin:fixture:remote-real-history', 'Updated by the real service event'])); response.end('{"changed":true}'); return }
    if (url.pathname === '/new-code') { invitation = { link: (await cli('pair')).trim() }; response.end(JSON.stringify(invitation)); return }
    if (request.method === 'PUT' && /^\/rooms\/[a-f0-9]{64}(\/(offers|answers)\/[A-Za-z0-9-]+)?$/.test(url.pathname)) { boxes.set(url.pathname, { ...JSON.parse(body), at: Date.now() }); response.end('{}'); return }
    if (url.pathname.endsWith('/offers')) { response.end(JSON.stringify([...boxes].filter(([path, value]) => path.startsWith(`${url.pathname}/`) && value.at > Date.now()-60000).map(([path,value]) => ({id:path.split('/').at(-1),box:value.box})))); return }
    response.end(JSON.stringify(boxes.get(url.pathname) ?? {}))
  } catch (error) { response.writeHead(500); response.end(JSON.stringify({error:error.message})) }
})
server.listen(47932, '127.0.0.1')
await start()
await cli('access','enable','--signal','http://127.0.0.1:47932')
invitation = { link: (await cli('pair')).trim() }
await writeFile(join(folder,'evidence.json'), JSON.stringify({directory,project,hidden,service:join(folder,'service'),started:Date.now()}))
console.log(JSON.stringify({ folder, directory, project, url: 'http://127.0.0.1:5213/test/browser/remote-clients/' }))
process.on('SIGINT', () => { child.kill('SIGTERM'); server.close(); process.exitCode=0 })
