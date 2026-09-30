import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'

import { app, net } from 'electron'

import type { SpeechModel } from '../shared/api'

/**
 * whisper.cpp on this computer: the whisper-cli that ships inside the app, and
 * the model it hears with, fetched once on first use into userData.
 *
 * The model is written to a `.part` file, picked up from the byte it reached
 * after any failure, and only named as the model once its size and sha256 are
 * the ones Hugging Face lists for it.
 */

const NAME = 'ggml-large-v3-turbo-q5_0.bin'
const FROM = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${NAME}`
const SIZE = 574_041_195
const SHA256 = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'

const TRIES = 5
/** A download that has said nothing for this long is taken as dropped and picked up again. */
const STALLED = 60_000

const OS: Readonly<Partial<Record<NodeJS.Platform, string>>> = { darwin: 'mac', win32: 'win', linux: 'linux' }

/** The copy packed into the app; from the source, the one scripts/whisper.sh built, or else whatever the PATH has. */
export function whisperCli(): string {
  const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  if (app.isPackaged) return join(process.resourcesPath, 'whisper', exe)
  const built = join(app.getAppPath(), 'whisper', 'bin', `${OS[process.platform] ?? process.platform}-${process.arch}`, exe)
  return existsSync(built) ? built : exe
}

const folder = (): string => join(app.getPath('userData'), 'whisper')
const modelPath = (): string => join(folder(), NAME)
const partPath = (): string => `${modelPath()}.part`

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

let view: SpeechModel | undefined
let fetching: Promise<string> | undefined
let toldAt = 0
const watchers = new Set<(view: SpeechModel) => void>()

export function speechModel(): SpeechModel {
  view ??= existsSync(modelPath())
    ? { state: 'ready', received: SIZE, total: SIZE }
    : { state: 'absent', received: sizeOf(partPath()), total: SIZE }
  return view
}

/** Told as the download moves, at most five times a second, and at once whenever its state changes. */
export function onSpeechModel(watcher: (view: SpeechModel) => void): () => void {
  watchers.add(watcher)
  return () => watchers.delete(watcher)
}

function set(next: SpeechModel): void {
  const changed = next.state !== speechModel().state
  view = next
  const now = Date.now()
  if (!changed && now - toldAt < 200) return
  toldAt = now
  for (const watcher of watchers) watcher(next)
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/** One go at it, from wherever the part file stands. */
async function download(): Promise<void> {
  const part = partPath()
  let received = sizeOf(part)
  if (received < SIZE) {
    const stop = new AbortController()
    let quiet = setTimeout(() => stop.abort(), STALLED)
    try {
      const response = await net.fetch(FROM, {
        headers: received > 0 ? { Range: `bytes=${String(received)}-` } : {},
        signal: stop.signal,
      })
      if (!response.ok || response.body === null) throw new Error(`Hugging Face answered ${String(response.status)}`)
      // A server that ignores the range sends it all again, from the start.
      if (response.status !== 206) received = 0
      const body = Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
      body.on('data', (chunk: Buffer) => {
        clearTimeout(quiet)
        quiet = setTimeout(() => stop.abort(), STALLED)
        received += chunk.length
        set({ state: 'downloading', received, total: SIZE })
      })
      await pipeline(body, createWriteStream(part, { flags: received > 0 ? 'a' : 'w' }))
    } finally {
      clearTimeout(quiet)
    }
  }
  if (sizeOf(part) !== SIZE || (await sha256(part)) !== SHA256) {
    unlinkSync(part)
    throw new Error('The downloaded model was damaged')
  }
  renameSync(part, modelPath())
}

/** The model's path, downloaded first where it is not here yet. Asked again while it downloads, the same download is waited for. */
export function fetchSpeechModel(): Promise<string> {
  if (existsSync(modelPath())) return Promise.resolve(modelPath())
  fetching ??= (async () => {
    mkdirSync(folder(), { recursive: true })
    let failed = ''
    for (let attempt = 1; attempt <= TRIES; attempt += 1) {
      set({ state: 'downloading', received: sizeOf(partPath()), total: SIZE })
      try {
        await download()
        set({ state: 'ready', received: SIZE, total: SIZE })
        return modelPath()
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error)
        if (attempt < TRIES) await new Promise((done) => setTimeout(done, attempt * 3_000))
      }
    }
    set({ state: 'failed', received: sizeOf(partPath()), total: SIZE, error: failed })
    throw new Error(`The speech model could not be downloaded: ${failed}`)
  })().finally(() => {
    fetching = undefined
  })
  return fetching
}
