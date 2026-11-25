import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTestAccount, profilesFolder, serveTestLaunches, updateBrowserLocation, updateTestProfile } from '../src/cli/testing'
import { exportTestProfile, importTestProfile } from '../src/cli/profile-archive'
import { registerBrowserConversation } from '../src/cli/browser-lifecycle'
import { openTest } from '../src/cli/browser'
import { viewEnd, viewStart } from '../src/cli/live-view'
import { tabVideo } from '../src/service/remote/tab-video'

interface Reply { readonly ok: boolean; readonly error?: string; readonly result?: { readonly id?: number; readonly title?: string; readonly lines?: string[]; readonly text?: string; readonly jpeg?: string; readonly png?: string; readonly gif?: string; readonly sheet?: string; readonly value?: { readonly cookie?: string; readonly stored?: string; readonly moves?: number; readonly trusted?: boolean; readonly webdriver?: boolean }; readonly url?: string; readonly width?: number; readonly height?: number; readonly dark?: boolean; readonly still?: boolean; readonly caret?: { readonly x: number; readonly y: number; readonly height: number; readonly color?: string }; readonly fields?: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] } }
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
async function start(path: string, name: string): Promise<void> {
  child = spawn(process.execPath, [process.env['GECKIT_BROWSER_TEST_CLI'] ?? 'out/service/cli.js', 'browser-test', name], { env: { ...process.env, HOME: path, GECKIT_CAMOUFOX: process.env['GECKIT_CAMOUFOX_TEST_BINARY'] ?? '' }, stdio: 'pipe' })
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

it.skipIf(process.env['GECKIT_CAMOUFOX_INTEGRATION'] !== '1')('reports shared and profile location settings in real Camoufox and restores system defaults', async () => {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><title>Location check</title><main>${request.headers['accept-language'] ?? ''}</main>`)
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No local server address.')
  const path = root()
  const geolocation = { latitude: 40.7128, longitude: -74.006 }
  const url = `http://127.0.0.1:${address.port}`
  const localeCode = '({language:navigator.language,languages:navigator.languages,locale:new Intl.DateTimeFormat().resolvedOptions().locale,timezone:new Intl.DateTimeFormat().resolvedOptions().timeZone,header:document.querySelector("main").textContent})'
  makeTestAccount('regional', '', path, true)
  mkdirSync(join(profilesFolder(path), 'regional'), { recursive: true })
  writeFileSync(join(profilesFolder(path), 'regional', 'prefs.js'), 'user_pref("intl.accept_languages", "fr, en");\n')
  await start(path, 'regional')
  const initialTab = (await ask(path, { cmd: 'open', url })).result?.id
  const systemDefaults = (await ask(path, { cmd: 'eval', tab: initialTab, code: localeCode })).result?.value
  expect(systemDefaults).toMatchObject({ language: 'fr' })
  await stop(path)
  updateBrowserLocation(null, { geolocation, language: 'es', region: 'US', timezone: 'Pacific/Honolulu' }, path)
  updateBrowserLocation('regional', { language: 'en' }, path)
  await start(path, 'regional')
  const { result } = await ask(path, { cmd: 'open', url })
  const tab = result?.id
  expect(tab).toBeTypeOf('number')
  const locale = await ask(path, { cmd: 'eval', tab, code: localeCode })
  expect(locale.result?.value).toMatchObject({ language: 'en-US', languages: expect.arrayContaining(['en-US']), locale: 'en-US', timezone: 'Pacific/Honolulu', header: 'en-US,en;q=0.5' })
  await ask(path, { cmd: 'permission', tab, kind: 'geolocation', setting: 'allow' })
  const location = await ask(path, { cmd: 'eval', tab, code: 'new Promise(resolve => navigator.geolocation.getCurrentPosition(({coords}) => resolve({latitude:coords.latitude,longitude:coords.longitude}), error => resolve({error:error.message}), {timeout:4000}))' })
  expect(location.result?.value).toMatchObject(geolocation)
  updateBrowserLocation('regional', {}, path)
  expect((await ask(path, { cmd: 'eval', tab, code: localeCode })).result?.value).toEqual(locale.result?.value)
  await stop(path)
  await start(path, 'regional')
  const reopened = (await ask(path, { cmd: 'open', url })).result?.id
  expect((await ask(path, { cmd: 'eval', tab: reopened, code: localeCode })).result?.value).toMatchObject({ language: 'es-US', locale: 'es-US', timezone: 'Pacific/Honolulu', header: 'es-US,es;q=0.5' })
  await stop(path)
  updateBrowserLocation(null, {}, path)
  await start(path, 'regional')
  const reset = (await ask(path, { cmd: 'open', url })).result?.id
  expect((await ask(path, { cmd: 'eval', tab: reset, code: localeCode })).result?.value).toEqual(systemDefaults)
  await stop(path)
}, 45_000)

it.skipIf(process.env['GECKIT_CAMOUFOX_INTEGRATION'] !== '1')('runs persistent profiles, live sign-in, rename, archive restore and conversation ownership in real Camoufox', async () => {
  server = createServer((request, response) => {
    if (request.url === '/file') { response.setHeader('Content-Disposition', 'attachment; filename=report.txt'); response.end('Camoufox download kept'); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (request.url?.startsWith('/login')) response.setHeader('Set-Cookie', 'session=local-test; Max-Age=3600; Path=/; SameSite=Lax')
    response.end(`<!doctype html><title>Camoufox local sign-in</title><style>body{font:18px sans-serif;padding:30px}input,button{font:inherit;padding:12px;display:block;margin:15px}</style><h1>Local sign-in check</h1><form action="/login"><input aria-label="Account" name="account"><button>Sign in locally</button></form><a href="/other" target="_blank">Open another tab</a><a href="/file" download>Download report</a><div style="height:1600px">Scroll area</div><button id="popup" style="position:fixed;left:0;top:0;width:24px;height:24px;margin:0;padding:0" onclick="if(location.pathname==='/other')window.close();else window.open('/other','popup','width=500,height=600')"></button><script>if(location.pathname==='/login')localStorage.setItem('account','local-test');document.documentElement.dataset.moves='0';document.documentElement.dataset.trusted='true';addEventListener('mousemove',e=>{document.documentElement.dataset.moves=String(Number(document.documentElement.dataset.moves)+1);if(!e.isTrusted)document.documentElement.dataset.trusted='false'})</script>`)
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
  await ask(first, { cmd: 'view-open', url })
  const shown = async (path: string): Promise<void> => { for (let tries = 0; tries < 100; tries++) { if ((await ask(first, { cmd: 'view-frame' })).result?.url === `${url}${path}`) return; await wait() }; throw new Error(`The live view did not show ${path}.`) }
  await ask(first, { cmd: 'view-input', input: { type: 'go', url: `127.0.0.1:${address.port}/start` } })
  await shown('/start')
  await ask(first, { cmd: 'view-input', input: { type: 'click', x: 10, y: 10 } })
  await shown('/other')
  expect((await ask(first, { cmd: 'view-frame' })).result).toMatchObject({ width: 1280, height: 800 })
  await ask(first, { cmd: 'view-input', input: { type: 'click', x: 10, y: 10 } })
  await shown('/start')
  await ask(first, { cmd: 'view-input', input: { type: 'click', x: 140, y: 155 } })
  const focused = (await ask(first, { cmd: 'view-frame' })).result
  expect(focused?.fields?.some((one) => 140 >= one.x && 140 <= one.x + one.width && 155 >= one.y && 155 <= one.y + one.height)).toBe(true)
  expect(focused?.fields?.some((one) => 600 >= one.x && 600 <= one.x + one.width && 600 >= one.y && 600 <= one.y + one.height)).toBe(false)
  const empty = focused?.caret
  expect(empty).toMatchObject({ height: expect.any(Number), color: 'rgb(0, 0, 0)' })
  await ask(first, { cmd: 'view-input', input: { type: 'text', text: 'abc' } })
  const typed = (await ask(first, { cmd: 'view-frame' })).result?.caret
  expect(typed?.x).toBeGreaterThan(empty?.x ?? Infinity); expect(typed?.y).toBe(empty?.y)
  expect(empty?.x).toBeGreaterThan(40); expect(empty?.x).toBeLessThan(80); expect(empty?.y).toBeGreaterThan(120); expect(empty?.y).toBeLessThan(150)
  await ask(first, { cmd: 'view-input', input: { type: 'click', x: 600, y: 600 } })
  expect((await ask(first, { cmd: 'view-frame' })).result?.caret).toBeUndefined()
  await ask(first, { cmd: 'view-close' })
  await stop(first)
  const archive = await exportTestProfile('renamed', join(first, 'profile.gz'), { root: first })
  const second = root()
  await importTestProfile(archive, 'restored', { root: second })
  registerBrowserConversation('a', '/local-test', false, folder(second)); registerBrowserConversation('b', '/local-test', false, folder(second))
  await start(second, 'restored')
  const own = (await ask(second, { cmd: 'open', conversation: 'a', url })).result?.id
  const transferred = (await ask(second, { cmd: 'eval', conversation: 'a', tab: own, code: stateCode })).result?.value
  expect(transferred).toEqual(saved)
  const other = (await ask(second, { cmd: 'open', conversation: 'b', url })).result?.id
  expect((await ask(second, { cmd: 'text', conversation: 'a', tab: other })).result?.text).toContain('Local sign-in check')
  const refused = await ask(second, { cmd: 'close', conversation: 'a', tab: other }, false)
  expect(refused.ok).toBe(false); expect(refused.error).toContain('another conversation')
  const key = randomUUID()
  const existing = { tab: own, conversation: 'a' }
  expect((await ask(second, { cmd: 'handoff-check', ...existing })).ok).toBe(true)
  expect((await ask(second, { cmd: 'view-handoff', tab: other, conversation: 'a', key }, false)).error).toContain('another conversation')
  await ask(second, { cmd: 'view-handoff', ...existing, key })
  expect((await ask(second, { cmd: 'view-handoff', ...existing, key: randomUUID() }, false)).error).toContain('already has a live view')
  expect((await ask(second, { cmd: 'close', ...existing }, false)).error).toContain('person is using this tab')
  expect((await ask(second, { cmd: 'view-frame' }, false)).error).toContain('another sign-in')
  expect((await ask(second, { cmd: 'view-frame', key })).result?.url).toBe(`${url}/`)
  let jpeg: string | undefined
  let streamStopped = false
  const video = await tabVideo((event) => {
    if (event.type === 'frame') jpeg = event.jpeg
    if (event.type === 'stop') streamStopped = true
    return true
  })
  if (video === undefined) throw new Error('Could not listen for the tab screencast.')
  try {
    expect((await ask(second, { cmd: 'view-video', key: randomUUID(), url: video.endpoint }, false)).ok).toBe(false)
    await ask(second, { cmd: 'view-video', key, url: video.endpoint })
    await until(() => jpeg !== undefined)
    const firstFrame = jpeg
    await ask(second, { cmd: 'view-input', key, input: { type: 'click', x: 140, y: 155 } })
    await ask(second, { cmd: 'view-input', key, input: { type: 'text', text: 'same-tab' } })
    const metadata = (await ask(second, { cmd: 'view-metadata', key })).result
    expect(metadata).toMatchObject({ url: `${url}/`, jpeg: '', caret: expect.any(Object), focusedField: expect.any(Object) })
    await until(() => jpeg !== firstFrame)
    await ask(second, { cmd: 'view-input', key, input: { type: 'key', key: 'Enter' } })
    await wait(300)
    expect((await ask(second, { cmd: 'view-frame', key })).result?.url).toContain('/login?account=same-tab')
    await ask(second, { cmd: 'view-input', key, input: { type: 'click', x: 10, y: 10 } })
    await until(() => streamStopped)
    expect((await ask(second, { cmd: 'view-frame', key })).result?.url).toContain('/other')
    await ask(second, { cmd: 'view-input', key, input: { type: 'click', x: 10, y: 10 } })
  } finally { video.stop() }
  await ask(second, { cmd: 'view-close', key })
  expect((await ask(second, { cmd: 'view-frame', key }, false)).ok).toBe(false)
  expect((await ask(second, { cmd: 'eval', ...existing, code: 'location.search' })).result).toMatchObject({ value: '?account=same-tab' })
  expect((await ask(second, { cmd: 'text', conversation: 'b', tab: other })).ok).toBe(true)
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

it.skipIf(process.env['GECKIT_CAMOUFOX_INTEGRATION'] !== '1')('shares the on-demand driver between app and CLI tabs and stops after the last tab', async () => {
  const path = root()
  const name = 'shared'
  const browserFolder = folder(path)
  vi.stubEnv('HOME', path)
  vi.stubEnv('GECKIT_CAMOUFOX', process.env['GECKIT_CAMOUFOX_TEST_BINARY'])
  const wrapper = join(path, '.geckit', 'bin', process.platform === 'win32' ? 'geckit-browser-host.bat' : 'geckit-browser-host')
  mkdirSync(join(path, '.geckit', 'bin'), { recursive: true })
  writeFileSync(wrapper, '')
  makeTestAccount(name, 'Test account', path, true)
  for (const thread of ['a', 'b']) registerBrowserConversation(`codex:${thread}`, '/test', false, browserFolder)
  const script = process.env['GECKIT_BROWSER_TEST_CLI'] ?? 'out/service/cli.js'
  const stopLaunches = serveTestLaunches(process.execPath, script, browserFolder, path)
  const run = promisify(execFile)
  const cli = async (thread: string, ...args: string[]): Promise<string> => (await run(process.execPath, [script, 'browser', ...args], { env: { ...process.env, CODEX_THREAD_ID: thread }, timeout: 30_000 })).stdout
  const profile = ['--profile', `geckit:${name}`]
  try {
    const opened = await openTest(name)
    expect(opened.ok, opened.said).toBe(true)
    const pid = cards(path)[0]?.pid
    expect(pid).toBeTypeOf('number')
    const manual = cards(path)[0]?.tabs[0]
    expect(manual).toBeTypeOf('number')
    const url = `data:text/html,<title>Chat tab</title><h1>Chat tab</h1><button onclick="window.open('about:blank')">Popup</button>`
    await Promise.all([viewStart(name), cli('a', 'open', url, ...profile), cli('b', 'open', url, ...profile)])
    expect(cards(path).map((card) => card.pid)).toEqual([pid])
    const listing = await cli('a', 'pages', ...profile)
    const own = listing.split('\n').find((line) => line.includes('Chat tab') && !line.includes('[read-only]'))?.trim().split(/\s+/)[0]
    expect(own).toBeDefined()
    expect(listing.split('\n').filter((line) => line.includes('[read-only]'))).toHaveLength(3)
    await expect(cli('b', 'text', String(own))).resolves.toContain('Chat tab')
    await expect(cli('b', 'eval', String(own), 'document.body.remove()')).rejects.toMatchObject({ stdout: expect.stringContaining('belongs to another conversation') })
    await expect(cli('b', 'go', String(manual), 'about:blank')).rejects.toMatchObject({ stdout: expect.stringContaining('belongs to another conversation') })
    await expect(cli('b', 'close', String(own))).rejects.toMatchObject({ stdout: expect.stringContaining('belongs to another conversation') })
    const read = await cli('a', 'read', String(own))
    const trigger = read.match(/\[(\d+)\].*Popup/)?.[1]
    expect(trigger).toBeDefined()
    await cli('a', 'click', String(own), String(trigger))
    const withPopup = await cli('a', 'pages', ...profile)
    const popup = withPopup.split('\n').find((line) => line.includes(`opened by ${own}`))
    expect(popup).toBeDefined()
    expect(popup).not.toContain('[read-only]')
    await viewEnd(name)
    expect(cards(path)[0]?.tabs).toHaveLength(4)
    registerBrowserConversation('codex:a', '/test', true, browserFolder)
    await until(() => cards(path)[0]?.tabs.length === 2)
    registerBrowserConversation('codex:b', '/test', true, browserFolder)
    await until(() => cards(path)[0]?.tabs.length === 1)
    expect(cards(path)[0]?.tabs).toEqual([manual])
    await ask(path, { cmd: 'close', tab: manual })
    await until(() => cards(path).length === 0)
    registerBrowserConversation('codex:a', '/test', false, browserFolder)
    await expect(cli('a', 'open', 'about:blank', ...profile)).resolves.toContain('about:blank')
    expect(cards(path)[0]?.pid).not.toBe(pid)
    registerBrowserConversation('codex:a', '/test', true, browserFolder)
    await until(() => cards(path).length === 0)
    await viewStart(name)
    expect(cards(path)[0]?.tabs).toHaveLength(1)
    await viewEnd(name)
    await until(() => cards(path).length === 0)
    await Promise.all([viewStart(name), viewEnd(name)])
    await until(() => cards(path).length === 0)
  } finally {
    stopLaunches()
    for (const card of cards(path)) process.kill(card.pid, 'SIGTERM')
    await until(() => cards(path).length === 0)
    vi.unstubAllEnvs()
  }
}, 90_000)
