import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { makeTestAccount, profilesFolder, updateTestProfile } from '../src/cli/testing'
import { exportTestProfile, importTestProfile } from '../src/cli/profile-archive'
import { registerBrowserConversation } from '../src/cli/browser-lifecycle'

interface Reply { readonly ok: boolean; readonly error?: string; readonly result?: { readonly id?: number; readonly title?: string; readonly lines?: string[]; readonly text?: string; readonly jpeg?: string; readonly png?: string; readonly gif?: string; readonly sheet?: string; readonly value?: { readonly cookie?: string; readonly stored?: string; readonly moves?: number; readonly trusted?: boolean; readonly webdriver?: boolean }; readonly url?: string; readonly width?: number; readonly height?: number; readonly dark?: boolean; readonly still?: boolean } }
const wait = (ms = 50): Promise<void> => new Promise((done) => setTimeout(done, ms))
const roots: string[] = []
let child: ChildProcess | undefined
let server: Server | undefined
const root = (): string => { const path = mkdtempSync(join(tmpdir(), 'geckit-camoufox-live-')); roots.push(path); return path }
const folder = (path: string): string => join(path, '.geckit', 'browser')
const cards = (path: string): { readonly pid: number; readonly tabs: number[] }[] => {
  try { return readdirSync(join(folder(path), 'hosts')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(join(folder(path), 'hosts', name), 'utf8')) as { pid: number; tabs: number[] }) } catch { return [] }
}
async function until(check: () => boolean): Promise<void> { for (let tries = 0; tries < 600; tries++) { if (check()) return; await wait() }; throw new Error('Browser state did not arrive.') }
async function start(path: string, name: string, conversation?: string): Promise<void> {
  child = spawn(process.execPath, [process.env['GECKIT_BROWSER_TEST_CLI'] ?? 'out/service/cli.js', 'browser-test', name], { env: { ...process.env, HOME: path, GECKIT_CAMOUFOX: process.env['GECKIT_CAMOUFOX_TEST_BINARY'] ?? '', GECKIT_TEST_CONVERSATION: conversation }, stdio: 'pipe' })
  let errors = ''
  child.stderr?.on('data', (data: Buffer) => { errors += data.toString() })
  try { await until(() => cards(path).length > 0) } catch (error) { throw new Error(`${String(error)} ${errors}`, { cause: error }) }
}
async function ask(path: string, request: object, fail = true): Promise<Reply> {
  const pid = cards(path)[0]?.pid
  if (pid === undefined) throw new Error('No live driver.')
  const file = join(folder(path), `${randomUUID()}.${pid}`)
  writeFileSync(`${file}.part`, JSON.stringify(request)); renameSync(`${file}.part`, `${file}.ask`)
  await until(() => existsSync(`${file}.told`))
  const reply = JSON.parse(readFileSync(`${file}.told`, 'utf8')) as Reply
  rmSync(`${file}.told`)
  if (!reply.ok && fail) throw new Error(reply.error)
  return reply
}
async function stop(path: string): Promise<void> { await ask(path, { cmd: 'quit' }); await until(() => cards(path).length === 0); child = undefined }
afterEach(async () => { child?.kill('SIGTERM'); child = undefined; if (server !== undefined) await new Promise<void>((done) => server?.close(() => done())); server = undefined; for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

it.skipIf(process.env['GECKIT_CAMOUFOX_INTEGRATION'] !== '1')('runs persistent profiles, live sign-in, rename, archive restore and conversation ownership in real Camoufox', async () => {
  server = createServer((request, response) => {
    if (request.url === '/file') { response.setHeader('Content-Disposition', 'attachment; filename=report.txt'); response.end('Camoufox download kept'); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (request.url?.startsWith('/login')) response.setHeader('Set-Cookie', 'session=local-test; Max-Age=3600; Path=/; SameSite=Lax')
    response.end(`<!doctype html><title>Camoufox local sign-in</title><style>body{font:18px sans-serif;padding:30px}input,button{font:inherit;padding:12px;display:block;margin:15px}</style><h1>Local sign-in check</h1><form action="/login"><input aria-label="Account" name="account"><button>Sign in locally</button></form><a href="/other" target="_blank">Open another tab</a><a href="/file" download>Download report</a><div style="height:1600px">Scroll area</div><script>if(location.pathname==='/login')localStorage.setItem('account','local-test');document.documentElement.dataset.moves='0';document.documentElement.dataset.trusted='true';addEventListener('mousemove',e=>{document.documentElement.dataset.moves=String(Number(document.documentElement.dataset.moves)+1);if(!e.isTrusted)document.documentElement.dataset.trusted='false'})</script>`)
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No local server address.')
  const url = `http://127.0.0.1:${address.port}`
  const first = root()
  makeTestAccount('source', 'Local sign-in check', first, true)
  await start(first, 'source')
  const opened = await ask(first, { cmd: 'open', url })
  const tab = opened.result?.id
  expect(tab).toBeTypeOf('number')
  const read = await ask(first, { cmd: 'read', tab })
  const input = read.result?.lines?.find((line) => line.includes('Account'))?.match(/^\[([^\]]+)\]/)?.[1]
  const button = read.result?.lines?.find((line) => line.includes('Sign in locally'))?.match(/^\[([^\]]+)\]/)?.[1]
  expect(input).toBeTruthy(); expect(button).toBeTruthy()
  await ask(first, { cmd: 'hover', tab, ref: button })
  const natural = (await ask(first, { cmd: 'eval', tab, code: '({moves:Number(document.documentElement.dataset.moves),trusted:document.documentElement.dataset.trusted==="true",webdriver:navigator.webdriver})' })).result?.value
  expect(natural?.moves).toBeGreaterThan(2); expect(natural?.trusted).toBe(true); expect(natural?.webdriver).toBe(false)
  await ask(first, { cmd: 'type', tab, ref: input, text: 'local-test' })
  expect((await ask(first, { cmd: 'style', tab, ref: button })).ok).toBe(true)
  expect((await ask(first, { cmd: 'shot', tab, ref: button })).result?.png?.length).toBeGreaterThan(100)
  const view = await ask(first, { cmd: 'view', tab, set: { width: 390, height: 844, scheme: 'dark', motion: 'reduce', phone: true } })
  expect(view.result).toMatchObject({ width: 390, height: 844, dark: true, still: true })
  await ask(first, { cmd: 'view', tab, reset: true })
  const recording = await ask(first, { cmd: 'record', tab, ms: 150, then: { cmd: 'hover', ref: button } })
  expect(recording.result?.gif?.length).toBeGreaterThan(100)
  const download = read.result?.lines?.find((line) => line.includes('Download report'))?.match(/^\[([^\]]+)\]/)?.[1]
  await ask(first, { cmd: 'click', tab, ref: download })
  await until(() => existsSync(join(first, 'Downloads', 'report.txt')) && readFileSync(join(first, 'Downloads', 'report.txt'), 'utf8') === 'Camoufox download kept')
  await ask(first, { cmd: 'click', tab, ref: download })
  await until(() => existsSync(join(first, 'Downloads', 'report (1).txt')) && readFileSync(join(first, 'Downloads', 'report (1).txt'), 'utf8') === 'Camoufox download kept')
  await ask(first, { cmd: 'view-open', url })
  expect((await ask(first, { cmd: 'view-frame' })).result?.jpeg?.length).toBeGreaterThan(100)
  await ask(first, { cmd: 'view-input', input: { type: 'click', x: 140, y: 155 } })
  await ask(first, { cmd: 'view-input', input: { type: 'text', text: 'local-test' } })
  await ask(first, { cmd: 'view-input', input: { type: 'key', key: 'Enter' } })
  await wait(300)
  expect((await ask(first, { cmd: 'view-frame' })).result?.url).toContain('/login')
  await ask(first, { cmd: 'view-close' })
  await stop(first)
  expect(readFileSync(join(first, 'Downloads', 'report.txt'), 'utf8')).toBe('Camoufox download kept')
  expect(existsSync(join(profilesFolder(first), 'source', 'cookies.sqlite'))).toBe(true)
  updateTestProfile('source', 'renamed', 'Renamed local sign-in', first)
  await start(first, 'renamed')
  const reopened = (await ask(first, { cmd: 'open', url })).result?.id
  const stateCode = '({cookie:document.cookie,stored:localStorage.getItem("account")})'
  const saved = (await ask(first, { cmd: 'eval', tab: reopened, code: stateCode })).result?.value
  expect(saved?.cookie).toContain('session=local-test'); expect(saved?.stored).toBe('local-test')
  await stop(first)
  const archive = await exportTestProfile('renamed', join(first, 'profile.gz'), { root: first })
  const second = root()
  await importTestProfile(archive, 'restored', { root: second })
  registerBrowserConversation('a', '/local-test', false, folder(second)); registerBrowserConversation('b', '/local-test', false, folder(second))
  await start(second, 'restored', 'a')
  const own = (await ask(second, { cmd: 'open', conversation: 'a', url })).result?.id
  const transferred = (await ask(second, { cmd: 'eval', conversation: 'a', tab: own, code: stateCode })).result?.value
  expect(transferred).toEqual(saved)
  const other = (await ask(second, { cmd: 'open', conversation: 'b', url })).result?.id
  const refused = await ask(second, { cmd: 'text', conversation: 'a', tab: other }, false)
  expect(refused.ok).toBe(false); expect(refused.error).toContain('another conversation')
  expect((await ask(second, { cmd: 'view-open', conversation: 'a', url }, false)).error).toContain('Only the person')
  registerBrowserConversation('a', '/local-test', true, folder(second))
  await until(() => !cards(second)[0]?.tabs.includes(own ?? -1))
  expect((await ask(second, { cmd: 'text', conversation: 'b', tab: other })).ok).toBe(true)
  registerBrowserConversation('b', '/local-test', true, folder(second))
  await until(() => cards(second).length === 0)
  child = undefined
  const evidence = process.env['GECKIT_CAMOUFOX_EVIDENCE']
  if (evidence !== undefined) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, 'real-browser.json'), JSON.stringify({ installedBinary: process.env['GECKIT_CAMOUFOX_TEST_BINARY'], natural, saved, transferred, refused, driver: 'Camoufox', account: 'local synthetic sign-in only', checked: ['open', 'read', 'hover', 'type', 'style', 'element screenshot', 'viewport and media', 'record', 'persistent website downloads and duplicate filenames', 'live-view screenshot and input', 'persistent cookies and storage', 'rename', 'archive export/import', 'conversation isolation', 'release and process exit'] }, null, 2)) }
}, 120_000)
