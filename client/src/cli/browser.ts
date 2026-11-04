import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { findModelServer, findModelState, findModelUsable, pickRefs } from './find-model'
import type { BrowserBridgeState } from '../shared/api'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import background from '../../extension/background.js?raw'
import manifest from '../../extension/manifest.json?raw'
import popup from '../../extension/popup.html?raw'
import popupScript from '../../extension/popup.js?raw'
import icon16 from '../../extension/icons/16.png?inline'
import icon32 from '../../extension/icons/32.png?inline'
import icon48 from '../../extension/icons/48.png?inline'
import icon128 from '../../extension/icons/128.png?inline'

export const BROWSER_HOST = 'org.geckit.browser'
export const EXTENSION_ID = 'ndoeihcbgkfaajhjeojbhmajkiojkjjp'
/** Ids the Chrome Web Store gave the extension; an install from the store has one of these instead of the unpacked id. */
export const STORE_EXTENSION_IDS: readonly string[] = []

const home = (): string => join(homedir(), '.geckit')
export const extensionFolder = (): string => join(home(), 'chrome-extension')
/** Where a request is left for the extension and its answer is picked up: a folder rather than a socket, so a sandboxed conversation needs only leave to write there. */
export const browserFolder = (): string => join(home(), 'browser')
const wrapperPath = (root: string = homedir()): string => join(root, '.geckit', 'bin', 'geckit-browser-host')

let bridgeOn = false
/** Whether Chrome through GeckIt is turned on in this process: the guides and Codex's sandbox follow it. */
export const browserBridgeOn = (): boolean => bridgeOn
export const setBrowserBridgeOn = (on: boolean): void => { bridgeOn = on }

interface Reply { readonly ok: boolean; readonly result?: unknown; readonly error?: string }

/** One Chrome profile with the extension: each starts its own host, which says here who it is and which tabs are its own. */
interface Profile { readonly pid: number; readonly label: string; readonly tabs: readonly number[]; readonly focused: number; readonly t: number }

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
  writeFileSync(join(folder, 'popup.html'), popup)
  writeFileSync(join(folder, 'popup.js'), popupScript)
  mkdirSync(join(folder, 'icons'), { recursive: true })
  for (const [size, data] of Object.entries({ 16: icon16, 32: icon32, 48: icon48, 128: icon128 })) writeFileSync(join(folder, 'icons', `${size}.png`), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'))
  const quoted = (path: string): string => `"${path.replace(/(["\\$`])/g, '\\$1')}"`
  const wrapper = wrapperPath(root)
  mkdirSync(dirname(wrapper), { recursive: true })
  writeFileSync(wrapper, ['#!/bin/sh', '# Written by GeckIt when it starts. Anything changed here is written over.', `${llama === undefined ? '' : `GECKIT_LLAMA_SERVER=${quoted(llama)} `}ELECTRON_RUN_AS_NODE=1 exec ${quoted(executable)} ${quoted(script)} browser-host "$@"`, ''].join('\n'))
  chmodSync(wrapper, 0o755)
  const described = `${JSON.stringify({ name: BROWSER_HOST, description: 'GeckIt Browser', path: wrapper, type: 'stdio', allowed_origins: [EXTENSION_ID, ...STORE_EXTENSION_IDS].map((id) => `chrome-extension://${id}/`) }, undefined, 2)}\n`
  for (const one of hostFolders(platform, root)) {
    try {
      mkdirSync(one, { recursive: true })
      writeFileSync(join(one, `${BROWSER_HOST}.json`), described)
    } catch { continue }
  }
}

/** Takes away what lets Chrome start GeckIt for the extension; the extension's own files stay, since Chrome loads it from there until the person removes it. */
export function removeBrowserBridge(platform: NodeJS.Platform = process.platform, root: string = homedir()): void {
  for (const one of hostFolders(platform, root)) rmSync(join(one, `${BROWSER_HOST}.json`), { force: true })
  rmSync(wrapperPath(root), { force: true })
}

const fresh = (folder: string): boolean => { try { return Date.now() - statSync(join(folder, 'alive')).mtimeMs <= 15_000 } catch { return false } }

export function browserBridgeState(): BrowserBridgeState {
  return { supported: process.platform !== 'win32', connected: fresh(browserFolder()), folder: extensionFolder(), modelServer: findModelServer(), model: findModelState() }
}

/** The program Chrome starts for the extension: carries each request left in the folder to the extension and its answer back. */
export function browserHost(folder: string = browserFolder()): void {
  const waiting = new Map<number, (reply: Reply) => void>()
  const taken = new Set<string>()
  let next = 1
  let held = Buffer.alloc(0)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  mkdirSync(join(folder, 'hosts'), { recursive: true })
  const card = join(folder, 'hosts', `${process.pid}.json`)
  let me: Profile = { pid: process.pid, label: '', tabs: [], focused: 0, t: 0 }
  const say = (): void => {
    me = { ...me, t: Date.now() }
    writeFileSync(`${card}.part`, JSON.stringify(me))
    renameSync(`${card}.part`, card)
  }
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
      const message = JSON.parse(held.subarray(4, 4 + size).toString('utf8')) as Reply & { readonly id: number; readonly event?: string; readonly label?: string; readonly tabs?: number[]; readonly focused?: number }
      held = held.subarray(4 + size)
      if (message.event === 'profile') { me = { ...me, label: message.label || `profile ${process.pid}`, tabs: message.tabs ?? [], focused: message.focused ?? 0 }; say(); continue }
      const back = waiting.get(message.id)
      waiting.delete(message.id)
      back?.(message)
    }
  })
  process.stdin.on('end', () => { rmSync(join(folder, 'alive'), { force: true }); rmSync(card, { force: true }); process.exit(0) })
  const pick = (): void => {
    for (const file of readdirSync(folder)) {
      if (!file.endsWith('.ask')) continue
      const name = file.slice(0, -4)
      const to = /\.(\d+)$/.exec(name)?.[1]
      if (to !== undefined && Number(to) !== process.pid) continue
      if (taken.has(name)) continue
      taken.add(name)
      let request: object
      let text: string
      try { text = readFileSync(join(folder, file), 'utf8') } catch { continue }
      rmSync(join(folder, file), { force: true })
      try { request = JSON.parse(text) as object } catch { answer(name, { ok: false, error: 'That was not a request.' }); continue }
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
    const read = await extension({ cmd: 'read', tab, find: query })
    if (!read.ok) return read
    const page = read.result as { readonly title: string; readonly url: string; readonly lines: readonly string[] }
    const byWords = (note: string): Reply => {
      const words = query.toLowerCase().split(/\s+/).filter((one) => one !== '')
      return { ok: true, result: { ...page, lines: page.lines.filter((line) => words.every((one) => line.toLowerCase().includes(one))), note } }
    }
    if (!findModelUsable()) {
      const state = findModelState()
      return byWords(!findModelServer() ? 'Matched by words: the find model is not part of this GeckIt.' : `Matched by words: the find model is not downloaded yet, ${Math.round((state.received / state.total) * 100)}%.`)
    }
    try {
      const refs = await pickRefs(query, page.lines)
      const lines = refs.flatMap((ref) => page.lines.filter((line) => line.startsWith(`[${ref}] `)))
      return { ok: true, result: { ...page, lines } }
    } catch (error) { return byWords(`Matched by words: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const beat = (): void => {
    if (!existsSync(wrapperPath())) { rmSync(join(folder, 'alive'), { force: true }); rmSync(card, { force: true }); process.exit(0) }
    writeFileSync(join(folder, 'alive'), String(process.pid))
    if (me.label !== '') say()
    for (const file of readdirSync(folder)) {
      if (file.endsWith('.told') && Date.now() - statSync(join(folder, file)).mtimeMs > 300_000) rmSync(join(folder, file), { force: true })
    }
  }
  void extension({ cmd: 'ping' }).then((reply) => {
    const loaded = (reply.result as { version?: string } | undefined)?.version
    if (reply.ok && loaded !== (JSON.parse(manifest) as { version: string }).version) tell({ id: next++, cmd: 'reload' })
  })
  beat()
  setInterval(beat, 5_000)
  watch(folder, pick)
  setInterval(pick, 1_000)
  pick()
}

const NOT_CONNECTED = (): string => `The GeckIt Browser extension is not connected to Chrome. Ask the person to open chrome://extensions, turn on Developer mode, press Load unpacked and choose ${extensionFolder()}. If it is already there, Chrome may be closed.`

/** The profiles whose host said who it is within the last 15 s. */
export function profiles(folder: string = browserFolder()): Profile[] {
  const where = join(folder, 'hosts')
  let files: string[]
  try { files = readdirSync(where).filter((one) => one.endsWith('.json')) } catch { return [] }
  return files.flatMap((one) => {
    try {
      const said = JSON.parse(readFileSync(join(where, one), 'utf8')) as Profile
      return Date.now() - said.t <= 15_000 ? [said] : []
    } catch { return [] }
  })
}

/** Which profile a request goes to: the one that owns its tab, the one asked for by name, or the one the person used last. */
export function pickProfile(known: readonly Profile[], request: { readonly tab?: number }, named?: string): Profile | string {
  if (named !== undefined) {
    const match = known.filter((one) => one.label.toLowerCase().includes(named.toLowerCase()))
    if (match.length === 1 && match[0] !== undefined) return match[0]
    return `${match.length === 0 ? 'No' : 'More than one'} Chrome profile matches ${named}. Profiles: ${known.map((one) => one.label).join(', ')}.`
  }
  if (request.tab !== undefined) {
    const owner = known.find((one) => one.tabs.includes(request.tab as number))
    if (owner !== undefined) return owner
    if (known.length > 1) return `No tab ${request.tab} in any Chrome profile. Run geckit browser pages for the current ids.`
  }
  return [...known].sort((a, b) => b.focused - a.focused)[0] ?? 'No Chrome profile is connected.'
}

async function ask(request: object, folder: string = browserFolder(), to?: number): Promise<Reply> {
  if (process.platform !== 'win32' && !existsSync(wrapperPath())) return { ok: false, error: 'Chrome through GeckIt is off. Turn it on in GeckIt Settings > Assistants.' }
  if (!fresh(folder)) return { ok: false, error: NOT_CONNECTED() }
  const name = to === undefined ? randomUUID() : `${randomUUID()}.${to}`
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

  pages [--profile <name>]      tabs: id, title, url (* is the tab shown in its window), under each Chrome profile's email
  open <url> [--profile <name>] open in a new background tab and wait for it to load; the profile used last unless --profile
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
  shot <tab> [<ref>] [-o <file>] a PNG of what the tab shows, or of one element at full resolution; GeckIt's pointer is hidden unless --pointer
  hover <tab> <ref>             move the mouse over an element, to see its hover state
  style <tab> <ref>             the element's computed style, values every element has left out
  view <tab> [--size <w>x<h>] [--phone] [--dark|--light] [--reduced-motion|--motion]
                                emulate a window size, a colour scheme or reduced motion in this tab; --reset ends it
  record <tab> [<ref>] [--click <ref>|--hover <ref>|--key <key>] [--for <ms>] [--slow <n>] [-o <folder>]
                                frames of an animation: starts, does the action, keeps recording --for 1500 ms of page time;
                                --slow 4 plays the page's animations four times slower; prints a sheet of up to 12 frames
                                with their times, a GIF, and the folder of every frame; <ref> crops the sheet and GIF to it
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

const VALUED = ['--max', '-o', '--size', '--click', '--hover', '--key', '--for', '--slow', '--profile']

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}

export async function browser(args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> {
  const [what, ...rest] = args
  if (what === undefined || what === 'help' || what === '--help') return { ok: true, said: BROWSER_HELP }
  const words = rest.filter((one, at) => !(one.startsWith('--') || one === '-o') && !VALUED.includes(rest[at - 1] ?? ''))
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
        case 'shot': return { cmd: 'shot', tab: tabOf(words[0]), ...(words[1] === undefined ? {} : { ref: refOf(words[1]) }), pointer: rest.includes('--pointer') }
        case 'hover': return { cmd: 'hover', tab: tabOf(words[0]), ref: refOf(words[1]) }
        case 'style': return { cmd: 'style', tab: tabOf(words[0]), ref: refOf(words[1]) }
        case 'view': {
          if (rest.includes('--reset')) return { cmd: 'view', tab: tabOf(words[0]), reset: true }
          const size = option(rest, '--size')
          const measured = size === undefined ? undefined : /^(\d+)x(\d+)$/.exec(size)
          if (size !== undefined && measured === null) throw new Error('Give the size as <width>x<height>, such as 1280x800.')
          const set = {
            ...(rest.includes('--phone') ? { width: 390, height: 844, phone: true } : {}),
            ...(measured ? { width: Number(measured[1]), height: Number(measured[2]), phone: false } : {}),
            ...(rest.includes('--dark') ? { scheme: 'dark' } : rest.includes('--light') ? { scheme: 'light' } : {}),
            ...(rest.includes('--reduced-motion') ? { motion: 'reduce' } : rest.includes('--motion') ? { motion: 'no-preference' } : {}),
          }
          if (Object.keys(set).length === 0) throw new Error('Give what to emulate: --size, --phone, --dark, --light, --reduced-motion, --motion, or --reset.')
          return { cmd: 'view', tab: tabOf(words[0]), set }
        }
        case 'record': {
          const ms = Number(option(rest, '--for') ?? 1500)
          const slow = Number(option(rest, '--slow') ?? 1)
          if (!(ms > 0 && ms * slow <= 20_000)) throw new Error('Record from 1 ms up to 20 seconds of real time, --for times --slow.')
          if (!(slow >= 1 && slow <= 20)) throw new Error('--slow takes 1 to 20.')
          const click = option(rest, '--click')
          const hover = option(rest, '--hover')
          const key = option(rest, '--key')
          const then = click !== undefined ? { cmd: 'click', ref: refOf(click) } : hover !== undefined ? { cmd: 'hover', ref: refOf(hover) } : key !== undefined ? { cmd: 'key', key } : undefined
          return { cmd: 'record', tab: tabOf(words[0]), ms, slow, pointer: rest.includes('--pointer'), ...(words[1] === undefined ? {} : { ref: refOf(words[1]) }), ...(then === undefined ? {} : { then }) }
        }
        default: throw new Error(`Unknown command ${what}.\n\n${BROWSER_HELP}`)
      }
    }
    const asked = request() as { readonly cmd: string; readonly tab?: number }
    const known = profiles()
    const named = option(rest, '--profile')
    if (asked.cmd === 'pages' && known.length > 1 && named === undefined) {
      const replies = await Promise.all(known.map(async (one) => ({ one, reply: await ask(asked, browserFolder(), one.pid) })))
      const failed = replies.find((one) => !one.reply.ok)
      if (failed !== undefined) return { ok: false, said: `${failed.one.label}: ${failed.reply.error ?? 'Chrome refused.'}` }
      return { ok: true, said: replies.map(({ one, reply }) => `${one.label}\n${shown(what, rest, words, reply.result)}`).join('\n\n') }
    }
    const target = known.length === 0 ? undefined : pickProfile(known, asked, named)
    if (typeof target === 'string') return { ok: false, said: target }
    const reply = await ask(asked, browserFolder(), target?.pid)
    if (!reply.ok) return { ok: false, said: reply.error ?? 'Chrome refused.' }
    return { ok: true, said: shown(what, rest, words, reply.result) }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
}

interface Page { readonly title: string; readonly url: string }

function shown(what: string, args: readonly string[], words: readonly string[], result: unknown): string {
  switch (what) {
    case 'status': { const known = profiles(); return `Connected, extension ${(result as { version: string }).version}${known.length > 1 ? `, in ${known.length} Chrome profiles: ${known.map((one) => one.label).join(', ')}` : ''}.` }
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
    case 'hover': return `Hovering over ${(result as { hovered: string }).hovered}.`
    case 'style': { const style = result as { name: string; lines: string[] }; return [style.name, ...style.lines].join('\n') }
    case 'view': {
      const view = result as { reset?: boolean; width: number; height: number; dark: boolean; still: boolean }
      if (view.reset === true) return 'The tab shows itself as Chrome does again.'
      return `The page sees ${view.width}x${view.height}, ${view.dark ? 'dark' : 'light'}, ${view.still ? 'reduced motion' : 'full motion'}, until view --reset. Chrome shows a debugging bar meanwhile.`
    }
    case 'record': {
      const taken = result as { did: string; slow: number; frames: { ms: number; data: string }[]; sheet: string; gif: string; total: number }
      const folder = resolve(option(args, '-o') ?? join(tmpdir(), `geckit-record-${words[0] ?? ''}-${Date.now()}`))
      mkdirSync(join(folder, 'frames'), { recursive: true })
      taken.frames.forEach((one, at) => writeFileSync(join(folder, 'frames', `${String(at).padStart(3, '0')}-${one.ms}ms.jpg`), Buffer.from(one.data, 'base64')))
      writeFileSync(join(folder, 'sheet.png'), Buffer.from(taken.sheet, 'base64'))
      writeFileSync(join(folder, 'animation.gif'), Buffer.from(taken.gif, 'base64'))
      const last = taken.frames.at(-1)?.ms ?? 0
      return [
        `Recorded ${taken.total} frames over ${last} ms of page time${taken.slow === 1 ? '' : `, played ${taken.slow} times slower`}, about ${Math.round((taken.total * 1000) / Math.max(1, last * taken.slow))} a second of real time; ${taken.did === 'nothing' ? 'did nothing' : taken.did}.`,
        `Sheet, ${Math.min(12, taken.frames.length)} frames with their times: ${join(folder, 'sheet.png')}`,
        `GIF: ${join(folder, 'animation.gif')}`,
        `Every frame: ${join(folder, 'frames')}`,
      ].join('\n')
    }
    default: return JSON.stringify(result)
  }
}
