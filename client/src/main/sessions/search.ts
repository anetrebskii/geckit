import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { ChatFound } from '../../shared/api'
import { typed } from './claude-read'
import { folders } from './disk'
import { plain } from './wording'

/**
 * Finding a conversation by what was said in it.
 *
 * What the person typed and what the assistant answered is taken out of each
 * conversation file once and kept; tool calls and what they printed are left
 * behind, which is most of a file. The files only ever grow, so a later search
 * reads just what was added since, and the conversation being had right now
 * costs no more than its last few lines.
 */

type Json = Readonly<Record<string, unknown>>

interface Said {
  readonly text: string
  readonly lower: string
}

interface Read {
  /** How far the file has been read, to the end of its last whole line. */
  readonly size: number
  readonly said: Said[]
}

const CHUNK = 4 * 1024 * 1024
const MOST = 50
const AROUND = 60
const SNIPPET = 160

const read = new Map<string, Read>()

const object = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
const string = (value: unknown): string => (typeof value === 'string' ? value : '')

/** What one entry of the file said in words, if anything: the person's message, or the assistant's answer. */
export function saidIn(entry: Json): string {
  if (entry['isSidechain'] === true) return ''
  const type = string(entry['type'])
  if (type === 'user') {
    const words = typed(entry)
    if (words !== '') return words
    const content = object(entry['message'])['content']
    // A message with a picture in it comes as blocks; a tool's output does too, and is not something said.
    if (!Array.isArray(content) || content.some((block) => string(object(block)['type']) === 'tool_result')) return ''
    return content.map((block) => (string(object(block)['type']) === 'text' ? string(object(block)['text']) : '')).join('\n')
  }
  if (type !== 'assistant') return ''
  const content = object(entry['message'])['content']
  if (!Array.isArray(content)) return ''
  return content.map((block) => (string(object(block)['type']) === 'text' ? string(object(block)['text']) : '')).join('\n')
}

async function readOn(path: string, from: number, to: number, said: Said[]): Promise<number> {
  const file = await open(path, 'r')
  try {
    let at = from
    let carry = Buffer.alloc(0)
    while (at < to) {
      const length = Math.min(CHUNK, to - at)
      const { buffer, bytesRead } = await file.read(Buffer.alloc(length), 0, length, at)
      if (bytesRead === 0) break
      at += bytesRead
      const joined = Buffer.concat([carry, buffer.subarray(0, bytesRead)])
      const end = joined.lastIndexOf(10)
      if (end < 0) {
        carry = joined
        continue
      }
      for (const line of joined.subarray(0, end).toString('utf8').split('\n')) {
        // What a tool printed is most of a file and none of what was said, so it is not even parsed.
        if (line.includes('"tool_use_id"') || !(line.includes('"type":"user"') || line.includes('"type":"assistant"'))) continue
        let entry: Json
        try {
          entry = JSON.parse(line) as Json
        } catch {
          continue
        }
        const text = saidIn(entry).trim()
        if (text !== '') said.push({ text, lower: text.toLowerCase() })
      }
      carry = joined.subarray(end + 1)
    }
    // A line still being written is read next time, whole.
    return at - carry.length
  } finally {
    await file.close()
  }
}

async function brought(path: string, size: number): Promise<Read> {
  const was = read.get(path)
  // Smaller than when it was read means it was written again from the start.
  const from = was === undefined || size < was.size ? { size: 0, said: [] } : was
  if (from.size === size) return from
  const said = [...from.said]
  const now = { size: await readOn(path, from.size, size, said), said }
  read.set(path, now)
  return now
}

/** The words around the first of them, on one line. */
function snippet(said: Said, words: readonly string[]): string {
  // The Markdown's marks are not what was said.
  const text = plain(said.text)
  const lower = text.toLowerCase()
  const first = Math.max(0, Math.min(...words.map((word) => lower.indexOf(word)).filter((at) => at >= 0)))
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, first - AROUND)) + 1)
  const cut = text.slice(start, start + SNIPPET).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '...' : ''}${cut}${start + SNIPPET < text.length ? '...' : ''}`
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * The conversations in these folders in which one message holds every word
 * asked, the ones touched last first, with the last such message. Nothing
 * asked brings the index up to date and finds nothing, which is what opening
 * the search does, so the first word typed does not wait for the disk.
 */
export function searchClaude(roots: readonly string[], asked: string): Promise<ChatFound[]> {
  const words = asked.toLowerCase().split(/\s+/).filter((word) => word !== '')
  // One at a time: two searches reading on from the same place would read the same lines twice.
  const run = async (): Promise<ChatFound[]> => {
    const found: (ChatFound & { readonly at: number })[] = []
    for (const root of roots) {
      for (const folder of await folders(root)) {
        for (const name of await readdir(folder).catch(() => [])) {
          if (!name.endsWith('.jsonl')) continue
          const path = join(folder, name)
          const file = await stat(path).catch(() => undefined)
          if (file?.isFile() !== true) continue
          const { said } = await brought(path, file.size).catch(() => ({ said: [] as Said[] }))
          if (words.length === 0) continue
          let count = 0
          let last: Said | undefined
          for (const one of said) {
            if (!words.every((word) => one.lower.includes(word))) continue
            count += 1
            last = one
          }
          if (last === undefined) continue
          found.push({ id: name.slice(0, -'.jsonl'.length), root, count, said: snippet(last, words), at: file.mtimeMs })
        }
      }
    }
    return found
      .sort((one, other) => other.at - one.at)
      .slice(0, MOST)
      .map(({ at: _at, ...hit }) => hit)
  }
  const searched = queue.then(run, run)
  queue = searched.catch(() => undefined)
  return searched
}
