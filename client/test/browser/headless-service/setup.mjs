import { spawn } from 'node:child_process'
import console from 'node:console'
import { createHash, randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
if (process.argv[2] === '--stop') {
  const directory = resolve(process.argv[3] ?? '')
  await readFile(join(directory, 'browser-harness.json'), 'utf8')
  const token = (await readFile(join(directory, 'operator-token'), 'utf8')).trim()
  await new Promise((done, reject) => {
    const normalized = directory.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const name = basename(normalized).replace(/[^A-Za-z0-9_-]+/g, '-')
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\geckit-${name}-${createHash('sha1').update(normalized).digest('hex').slice(0, 12)}` : join(directory, 'geckit.sock')
    const socket = connect(endpoint)
    socket.once('error', reject)
    socket.once('connect', () => socket.write(`${JSON.stringify({ action: 'operator', token, args: ['shutdown'] })}\n`))
    socket.once('data', () => { socket.destroy(); done() })
  })
  console.log('Isolated browser service stopped.')
  process.exit(0)
}
const client = resolve(here, '../../..')
const folder = await mkdtemp(join(tmpdir(), 'geckit-browser-service-'))
const directory = join(folder, 'data')
const project = join(folder, 'Workspace')
await mkdir(project)
await cp(join(client, 'out', 'service'), join(folder, 'service'), { recursive: true })
const plugin = join(directory, 'provider-plugins', 'plugin-fixture')
await cp(resolve(here, '../../fixtures/headless'), plugin, { recursive: true })
await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
const at = Date.now()
const first = 'plugin:fixture:service-workspace'
const second = 'plugin:fixture:service-settings'
await writeFile(join(directory, 'browser-harness.json'), JSON.stringify({ isolated: true, created: at }))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ projects: [project], chatProjects: [project], chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', chatModel: 'fixture', chatMode: 'manual', vpnIpCheck: false, guideClaude: false, guideCodex: false, providerAutoUpdate: false, analytics: false, analyticsAsked: true, welcomed: true, theme: 'light', newTaskRoot: project }))
await writeFile(join(directory, 'sessions.json'), JSON.stringify({ [first]: { here: true, title: 'Prepare the workspace', status: 'todo' }, [second]: { here: true, title: 'Review service settings', status: 'done' } }))
await writeFile(join(directory, 'fixture-history.json'), JSON.stringify([
  { id: first, root: project, title: 'Prepare the workspace', at, stands: 'Ready for the next task.', driven: false, items: [{ id: 'initial-request', kind: 'mine', text: 'Prepare this workspace so desktop and CLI can share it.', at }, { id: 'initial-answer', kind: 'theirs', text: 'The workspace is ready. New messages run through the service.', phase: 'final_answer' }] },
  { id: second, root: project, title: 'Review service settings', at: at - 1000, stands: 'Settings remain available after clients close.', driven: false, items: [{ id: 'settings-request', kind: 'mine', text: 'Keep settings available to every connected client.', at: at - 1000 }, { id: 'settings-answer', kind: 'theirs', text: 'Settings are stored by the service and shared with desktop and CLI.', phase: 'final_answer' }] },
]))
const env = { ...process.env, GECKIT_DATA: directory, GECKIT_VAULT_KEY: randomBytes(32).toString('base64'), HOME: join(folder, 'home'), CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') }
for (const key of ['DISPLAY', 'CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'GECKIT_MANAGER_SESSION', 'GECKIT_MANAGER_TOKEN', 'GECKIT_MANAGER_OPERATION', 'CLAUDECODE', 'GECKIT_SOURCE_CLI', 'GECKIT_SOURCE_GUIDE', 'GECKIT_SOURCE_CODEX_GUIDE']) delete env[key]
const logPath = join(folder, 'service.log')
const log = await open(logPath, 'a', 0o600)
const child = spawn(process.execPath, [join(folder, 'service', 'service.js'), '--data', directory], { cwd: client, env, stdio: ['ignore', log.fd, log.fd], detached: true })
await log.close()
const until = Date.now() + 15_000
for (;;) {
  const output = await readFile(logPath, 'utf8')
  if (output.includes('GeckIt service ready.')) break
  if (child.exitCode !== null || Date.now() > until) { child.kill('SIGTERM'); throw new Error(`Isolated service did not start: ${output}`) }
  await setTimeout(30)
}
child.unref()
console.log(JSON.stringify({ directory, project, pid: child.pid, url: 'http://127.0.0.1:5207/test/browser/headless-service/' }, null, 2))
