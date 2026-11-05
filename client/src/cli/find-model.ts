import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import type { ReadableStream } from 'node:stream/web'
import type { FindModelState } from '../shared/api'

const NAME = 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
const FROM = `https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/${NAME}`
const SIZE = 2_497_281_120
const SHA256 = '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597'
const IDLE = 5 * 60_000
const MAX_LINES = 600

const folder = (): string => join(homedir(), '.geckit', 'models')
const modelPath = (): string => join(folder(), NAME)
const partPath = (): string => `${modelPath()}.part`
const sizeOf = (path: string): number => { try { return statSync(path).size } catch { return 0 } }

let fetching: Promise<void> | undefined
let download: AbortController | undefined
let failure: string | undefined

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/** Fetches the model once into ~/.geckit/models, picking up a broken download from the byte it reached, and names it only once its size and sha256 match. */
export function fetchFindModel(): Promise<void> {
  if (fetching !== undefined) return fetching
  const controller = new AbortController()
  download = controller
  fetching = (async () => {
    failure = undefined
    mkdirSync(folder(), { recursive: true })
    for (let attempt = 0; attempt < 5 && !existsSync(modelPath()); attempt++) {
      if (controller.signal.aborted) break
      try {
        const have = sizeOf(partPath())
        if (have < SIZE) {
          const response = await fetch(FROM, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, signal: controller.signal })
          if (!response.ok || response.body === null) throw new Error(`Model download answered ${response.status}.`)
          const appending = have > 0 && response.status === 206
          await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), createWriteStream(partPath(), { flags: appending ? 'a' : 'w' }), { signal: controller.signal })
        }
        if (sizeOf(partPath()) !== SIZE || await sha256(partPath()) !== SHA256) { unlinkSync(partPath()); failure = 'the file did not match its checksum'; continue }
        renameSync(partPath(), modelPath())
      } catch (error) {
        if (controller.signal.aborted) break
        failure = error instanceof Error ? error.message : String(error)
        try { await sleep(3_000, undefined, { signal: controller.signal }) } catch { /* service is stopping */ }
      }
    }
    if (existsSync(modelPath()) || controller.signal.aborted) failure = undefined
  })().finally(() => { fetching = undefined; if (download === controller) download = undefined })
  return fetching
}

/** Ends a background download before the service exits. The partial file can be resumed later. */
export async function stopFindModelDownload(): Promise<void> {
  download?.abort()
  await fetching
}

export function findModelState(): FindModelState {
  if (existsSync(modelPath())) return { state: 'ready', received: SIZE, total: SIZE }
  const received = sizeOf(partPath())
  if (fetching !== undefined) return { state: 'downloading', received, total: SIZE }
  return failure === undefined ? { state: 'absent', received, total: SIZE } : { state: 'failed', received, total: SIZE, error: failure }
}

/** Takes the model and any part of it off this computer; a download under way finishes first. */
export async function deleteFindModel(): Promise<void> {
  await fetching
  failure = undefined
  for (const path of [modelPath(), partPath()]) { try { unlinkSync(path) } catch { /* already gone */ } }
}

/** Whether this GeckIt carries the program the model runs on. */
export const findModelServer = (): boolean => process.env['GECKIT_LLAMA_SERVER'] !== undefined && existsSync(serverPath())

const serverPath = (): string => process.env['GECKIT_LLAMA_SERVER'] ?? 'llama-server'

let server: { readonly child: ChildProcess; readonly port: number; readonly up: Promise<void> } | undefined
let idle: NodeJS.Timeout | undefined

function freePort(): Promise<number> {
  return new Promise((done, failed) => {
    const probe = createServer()
    probe.once('error', failed)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address !== null ? done(address.port) : failed(new Error('No free port.'))))
    })
  })
}

async function started(): Promise<number> {
  if (server === undefined) {
    const port = await freePort()
    const child = spawn(serverPath(), ['-m', modelPath(), '--host', '127.0.0.1', '--port', String(port), '-c', '16384', '-ngl', '99', '--no-webui', '--reasoning', 'off'], { stdio: 'ignore' })
    let failed = false
    child.once('error', () => { failed = true })
    const up = (async () => {
      for (let waited = 0; waited < 60_000; waited += 250) {
        if (failed) throw new Error(`Could not start ${serverPath()}.`)
        if (child.exitCode !== null) throw new Error('The find model stopped while starting.')
        try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return } catch { /* not listening yet */ }
        await new Promise((done) => setTimeout(done, 250))
      }
      throw new Error('The find model did not start within a minute.')
    })()
    const mine = { child, port, up }
    server = mine
    child.once('error', () => { if (server === mine) server = undefined })
    child.once('exit', () => { if (server === mine) server = undefined })
    process.once('exit', () => child.kill())
  }
  const current = server
  try { await current.up } catch (error) { current.child.kill(); server = undefined; throw error }
  if (idle !== undefined) clearTimeout(idle)
  idle = setTimeout(() => { current.child.kill(); server = undefined }, IDLE)
  return current.port
}

const ASK = `You find elements on a web page. You get the page as lines: headings start with #, every element that can be clicked or typed into starts with its ref in brackets, [ref] role "name". A line --- item N --- starts the Nth post, card or entry on the page and the lines after it belong to it. Headings and the order of lines show where an element sits on the page. Answer with the refs of the elements that match the request, best first, at most 8, and an empty list when nothing matches. Answer only with JSON.`

/** The refs a small local model picks from the page's lines for what was asked. */
export async function pickRefs(query: string, lines: readonly string[]): Promise<number[]> {
  const port = await started()
  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: ASK }, { role: 'user', content: `Page:\n${lines.slice(0, MAX_LINES).join('\n')}\n\nFind: ${query}` }],
      temperature: 0,
      max_tokens: 120,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_schema', json_schema: { name: 'found', schema: { type: 'object', properties: { refs: { type: 'array', items: { type: 'integer' }, maxItems: 8 } }, required: ['refs'] } } },
    }),
  })
  if (!response.ok) throw new Error(`The find model answered ${response.status}.`)
  const said = (await response.json()) as { choices: { message: { content: string } }[] }
  const refs = (JSON.parse(said.choices[0]?.message.content ?? '{}') as { refs?: unknown }).refs
  return Array.isArray(refs) ? refs.filter((one): one is number => Number.isInteger(one)) : []
}

/** Whether the model and the server it runs on are both here; GeckIt downloads the model when Chrome through GeckIt is turned on. */
export const findModelUsable = (): boolean => findModelServer() && existsSync(modelPath())
