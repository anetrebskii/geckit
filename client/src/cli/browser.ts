import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { findModelState, findModelUsable, pickRefs } from './find-model'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import background from '../../extension/background.js?raw'
import manifest from '../../extension/manifest.json?raw'

export const BROWSER_HOST = 'org.geckit.browser'
export const EXTENSION_ID = 'ndoeihcbgkfaajhjeojbhmajkiojkjjp'

const home = (): string => join(homedir(), '.geckit')
export const extensionFolder = (): string => join(home(), 'chrome-extension')
/** Where a request is left for the extension and its answer is picked up: a folder rather than a socket, so a sandboxed conversation needs only leave to write there. */
export const browserFolder = (): string => join(home(), 'browser')

interface Reply { readonly ok: boolean; readonly result?: unknown; readonly error?: string }

/** Chrome's own folders for native messaging hosts of the current user, for the browsers present here. */
function hostFolders(platform: NodeJS.Platform, root: string): string[] {
  const where = platform === 'darwin'
    ? ['Google/Chrome', 'Google/Chrome Beta', 'Google/Chrome Canary', 'Google/Chrome for Testing', 'Chromium'].map((one) => join(root, 'Library', 'Application Support', one))
    : platform === 'linux' ? ['google-chrome', 'google-chrome-beta', 'chromium'].map((one) => join(root, '.config', one)) : []
  return where.filter((one) => existsSync(one)).map((one) => join(one, 'NativeMessagingHosts'))
}

/** Puts the extension where the person loads it from, and registers the program Chrome starts for it. */
export function installBrowserBridge(executable: string, script: string, platform: NodeJS.Platform = process.platform, root: string = homedir(), llama: string | undefined = process.env['GECKIT_LLAMA_SERVER']): void {
  if (platform === 'win32') return
  const folder = join(root, '.geckit', 'chrome-extension')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'manifest.json'), manifest)
  writeFileSync(join(folder, 'background.js'), background)
  const quoted = (path: string): string => `"${path.replace(/(["\\$`])/g, '\\$1')}"`
  const wrapper = join(root, '.geckit', 'bin', 'geckit-browser-host')
  mkdirSync(dirname(wrapper), { recursive: true })
  writeFileSync(wrapper, ['#!/bin/sh', '# Written by GeckIt when it starts. Anything changed here is written over.', `${llama === undefined ? '' : `GECKIT_LLAMA_SERVER=${quoted(llama)} `}ELECTRON_RUN_AS_NODE=1 exec ${quoted(executable)} ${quoted(script)} browser-host "$@"`, ''].join('\n'))
  chmodSync(wrapper, 0o755)
  const described = `${JSON.stringify({ name: BROWSER_HOST, description: 'GeckIt Browser', path: wrapper, type: 'stdio', allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] }, undefined, 2)}\n`
  for (const one of hostFolders(platform, root)) {
    try {
      mkdirSync(one, { recursive: true })
      writeFileSync(join(one, `${BROWSER_HOST}.json`), described)
    } catch { continue }
  }
}

/** The program Chrome starts for the extension: carries each request left in the folder to the extension and its answer back. */
export function browserHost(folder: string = browserFolder()): void {
  const waiting = new Map<number, (reply: Reply) => void>()
  const taken = new Set<string>()
  let next = 1
  let held = Buffer.alloc(0)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const answer = (name: string, reply: Reply): void => {
    const file = join(folder, `${name}.told`)
    writeFileSync(`${file}.part`, JSON.stringify(reply))
    renameSync(`${file}.part`, file)
    taken.delete(name)
  }
  const tell = (message: object): void => {
    const body = Buffer.from(JSON.stringify(message))
    const head = Buffer.alloc(4)
    head.writeUInt32LE(body.length)
    process.stdout.write(Buffer.concat([head, body]))
  }
  process.stdin.on('data', (chunk: Buffer) => {
    held = Buffer.concat([held, chunk])
    while (held.length >= 4) {
      const size = held.readUInt32LE(0)
      if (held.length < 4 + size) break
      const message = JSON.parse(held.subarray(4, 4 + size).toString('utf8')) as Reply & { readonly id: number }
      held = held.subarray(4 + size)
      const back = waiting.get(message.id)
      waiting.delete(message.id)
      back?.(message)
    }
  })
  process.stdin.on('end', () => { rmSync(join(folder, 'alive'), { force: true }); process.exit(0) })
  const pick = (): void => {
    for (const file of readdirSync(folder)) {
      if (!file.endsWith('.ask')) continue
      const name = file.slice(0, -4)
      if (taken.has(name)) continue
      taken.add(name)
      let request: object
      try { request = JSON.parse(readFileSync(join(folder, file), 'utf8')) as object } catch { answer(name, { ok: false, error: 'That was not a request.' }); continue } finally { rmSync(join(folder, file), { force: true }) }
      const asked = request as { readonly cmd?: string; readonly tab?: number; readonly query?: string }
      void (asked.cmd === 'find' ? find(asked.tab, asked.query ?? '') : extension(request)).then((reply) => answer(name, reply), (error: Error) => answer(name, { ok: false, error: error.message }))
    }
  }
  const extension = (request: object): Promise<Reply> => new Promise((done) => {
    const id = next++
    const timer = setTimeout(() => { if (waiting.delete(id)) done({ ok: false, error: 'Chrome did not answer within 60 seconds.' }) }, 60_000)
    waiting.set(id, (reply) => { clearTimeout(timer); done(reply) })
    tell({ ...request, id })
  })
  const find = async (tab: number | undefined, query: string): Promise<Reply> => {
    const read = await extension({ cmd: 'read', tab })
    if (!read.ok) return read
    const page = read.result as { readonly title: string; readonly url: string; readonly lines: readonly string[] }
    const byWords = (note: string): Reply => {
      const words = query.toLowerCase().split(/\s+/).filter((one) => one !== '')
      return { ok: true, result: { ...page, lines: page.lines.filter((line) => words.every((one) => line.toLowerCase().includes(one))), note } }
    }
    if (!findModelUsable()) {
      const state = findModelState()
      return byWords(process.env['GECKIT_LLAMA_SERVER'] === undefined ? 'Matched by words: the find model is not part of this GeckIt.' : `Matched by words: the find model is downloading, ${Math.round((state.received / state.total) * 100)}%.`)
    }
    try {
      const refs = await pickRefs(query, page.lines)
      const lines = refs.flatMap((ref) => page.lines.filter((line) => line.startsWith(`[${ref}] `)))
      return { ok: true, result: { ...page, lines } }
    } catch (error) { return byWords(`Matched by words: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const beat = (): void => {
    writeFileSync(join(folder, 'alive'), String(process.pid))
    for (const file of readdirSync(folder)) {
      if (file.endsWith('.told') && Date.now() - statSync(join(folder, file)).mtimeMs > 300_000) rmSync(join(folder, file), { force: true })
    }
  }
  beat()
  setInterval(beat, 5_000)
  watch(folder, pick)
  setInterval(pick, 1_000)
  pick()
}

const NOT_CONNECTED = (): string => `The GeckIt Browser extension is not connected to Chrome. Ask the person to open chrome://extensions, turn on Developer mode, press Load unpacked and choose ${extensionFolder()}. If it is already there, Chrome may be closed.`

async function ask(request: object, folder: string = browserFolder()): Promise<Reply> {
  try { if (Date.now() - statSync(join(folder, 'alive')).mtimeMs > 15_000) return { ok: false, error: NOT_CONNECTED() } } catch { return { ok: false, error: NOT_CONNECTED() } }
  const name = randomUUID()
  const asked = join(folder, `${name}.ask`)
  try {
    writeFileSync(`${asked}.part`, JSON.stringify(request))
    renameSync(`${asked}.part`, asked)
  } catch { return { ok: false, error: `This sandbox may not write to ${folder}, where requests for Chrome are left. GeckIt's own Codex conversations may; elsewhere ask the person to allow writing there.` } }
  const told = join(folder, `${name}.told`)
  for (let waited = 0; waited < 70_000; waited += 100) {
    if (existsSync(told)) {
      const reply = JSON.parse(readFileSync(told, 'utf8')) as Reply
      rmSync(told, { force: true })
      return reply
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  rmSync(asked, { force: true })
  return { ok: false, error: 'The GeckIt Browser bridge did not answer within 70 seconds.' }
}

export const BROWSER_HELP = `geckit browser: the person's own Chrome, through the GeckIt Browser extension.

  pages                         tabs: id, title, url (* is the tab shown in its window)
  open <url>                    open in a new background tab and wait for it to load
  go <tab> <url>                load a url in a tab
  close <tab>
  text <tab> [--max <n>]        the page's main text, 6000 characters unless --max
  read <tab> [--all]            headings and what can be clicked or typed into, as [ref] role "name"; 200 lines unless --all
  find <tab> <what>             the lines of read that match a description, picked by a small local model
  click <tab> <ref> [--real]    click; --real clicks like a mouse, Chrome shows a debugging bar meanwhile
  type <tab> <ref> <text>       replace what the field holds
  key <tab> <key>               Enter, Tab, Escape, Backspace, arrows, PageDown or one character
  scroll <tab> [<ref>|up|down]  bring an element into view, or a screen down or up
  eval <tab> <js>               run JavaScript in the page, - reads it from stdin; prints the value as JSON
  shot <tab> [-o <file>]        a PNG of what the tab shows; prints the file
  status                        whether the extension is connected`

function tabOf(word: string | undefined): number {
  const id = Number(word)
  if (word === undefined || !Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
  return id
}

function refOf(word: string | undefined): string {
  if (word === undefined || !/^\d+$/.test(word)) throw new Error('Give the ref from geckit browser read, the number in brackets.')
  return word
}

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}

export async function browser(args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> {
  const [what, ...rest] = args
  if (what === undefined || what === 'help' || what === '--help') return { ok: true, said: BROWSER_HELP }
  const words = rest.filter((one, at) => !(one.startsWith('--') || one === '-o') && !['--max', '-o'].includes(rest[at - 1] ?? ''))
  try {
    const request = (): object => {
      switch (what) {
        case 'status': return { cmd: 'ping' }
        case 'pages': return { cmd: 'pages' }
        case 'open': if (words[0] === undefined) throw new Error('Give the url.'); return { cmd: 'open', url: words[0] }
        case 'go': if (words[1] === undefined) throw new Error('Give the tab and the url.'); return { cmd: 'go', tab: tabOf(words[0]), url: words[1] }
        case 'close': return { cmd: 'close', tab: tabOf(words[0]) }
        case 'text': return { cmd: 'text', tab: tabOf(words[0]) }
        case 'read': return { cmd: 'read', tab: tabOf(words[0]) }
        case 'find': if (words.length < 2) throw new Error('Give the tab and what to find, in words.'); return { cmd: 'find', tab: tabOf(words[0]), query: words.slice(1).join(' ') }
        case 'click': return { cmd: 'click', tab: tabOf(words[0]), ref: refOf(words[1]), real: rest.includes('--real') }
        case 'type': if (words.length < 3) throw new Error('Give the tab, the ref and the text.'); return { cmd: 'type', tab: tabOf(words[0]), ref: refOf(words[1]), text: words.slice(2).join(' ') }
        case 'key': if (words[1] === undefined) throw new Error('Give the tab and the key.'); return { cmd: 'key', tab: tabOf(words[0]), key: words[1] }
        case 'scroll': {
          const where = words[1] ?? 'down'
          return /^\d+$/.test(where) ? { cmd: 'scroll', tab: tabOf(words[0]), ref: where } : { cmd: 'scroll', tab: tabOf(words[0]), by: where === 'up' ? -1 : 1 }
        }
        case 'eval': {
          const code = words[1] === '-' ? readFileSync(0, 'utf8') : words.slice(1).join(' ')
          if (code.trim() === '') throw new Error('Give the JavaScript to run.')
          return { cmd: 'eval', tab: tabOf(words[0]), code }
        }
        case 'shot': return { cmd: 'shot', tab: tabOf(words[0]) }
        default: throw new Error(`Unknown command ${what}.\n\n${BROWSER_HELP}`)
      }
    }
    const reply = await ask(request())
    if (!reply.ok) return { ok: false, said: reply.error ?? 'Chrome refused.' }
    return { ok: true, said: shown(what, rest, words, reply.result) }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
}

interface Page { readonly title: string; readonly url: string }

function shown(what: string, args: readonly string[], words: readonly string[], result: unknown): string {
  switch (what) {
    case 'status': return `Connected, extension ${(result as { version: string }).version}.`
    case 'pages': return (result as (Page & { id: number; active: boolean })[]).map((one) => `${one.active ? '*' : ' '} ${String(one.id).padEnd(10)} ${one.title.slice(0, 70)}  ${one.url}`).join('\n')
    case 'open': case 'go': { const page = result as Page & { id: number }; return `${page.id}  ${page.title}  ${page.url}` }
    case 'close': return 'Closed.'
    case 'text': {
      const page = result as Page & { text: string }
      const max = Number(option(args, '--max') ?? 6000)
      const more = page.text.length - max
      return `${page.title}\n${page.url}\n\n${page.text.slice(0, max)}${more > 0 ? `\n\n... ${more} more characters, --max ${page.text.length} shows them` : ''}`
    }
    case 'read': case 'find': {
      const page = result as Page & { lines: string[]; note?: string }
      const limit = what === 'read' && !args.includes('--all') ? 200 : page.lines.length
      const more = page.lines.length - limit
      return [`${page.title}`, page.url, ...(page.note === undefined ? [] : [page.note]), '', ...page.lines.slice(0, limit), ...(more > 0 ? [`... ${more} more lines, --all shows them, find narrows them`] : []), ...(page.lines.length === 0 ? ['Nothing matches.'] : [])].join('\n')
    }
    case 'click': return `Clicked ${(result as { clicked: string }).clicked}.`
    case 'type': return `The field now holds: ${(result as { typed: string }).typed}`
    case 'key': return `Pressed ${(result as { pressed: string }).pressed}.`
    case 'scroll': { const at = result as { y: number; height: number; viewport: number }; return `At ${at.y} of ${at.height}, a screen is ${at.viewport}.` }
    case 'eval': return JSON.stringify((result as { value: unknown }).value, undefined, 2) ?? 'undefined'
    case 'shot': {
      const file = resolve(option(args, '-o') ?? join(tmpdir(), `geckit-tab-${words[0] ?? ''}-${Date.now()}.png`))
      writeFileSync(file, Buffer.from((result as { png: string }).png, 'base64'))
      return file
    }
    default: return JSON.stringify(result)
  }
}
