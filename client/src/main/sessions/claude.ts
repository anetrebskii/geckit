import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

import type { CardAnswer, SessionMode } from '../../shared/api'
import { planOnly } from './account'
import { AGAIN, claudeState, readClaude, REFUSED } from './claude-read'
import type { ClaudeRequest } from './claude-read'
import { askId } from './heard'
import type { Driver, Heard, Signal } from './heard'
import { questionsFromClaude } from './wording'

/**
 * One conversation with Claude Code, held by one process.
 *
 * The command is the person's own `claude`, found on their PATH and run as
 * they installed it, signed in however they signed it in. Nothing here looks
 * at how: no key is passed, no credential is read, and `--bare` - which would
 * turn the plan off and ask for a key - is never given. A key that is lying in
 * the environment is left out of it, because a session runs on the plan or not
 * at all (`planOnly` in `account.ts`). What is given is what the tool
 * documents for being driven by another program: print mode, lines of JSON in
 * both directions, and permission requests sent here to be answered.
 *
 * Checked against 2.1.278.
 */

export interface ClaudeOptions {
  readonly root: string
  /** The conversation's id: ours to choose for a new one, the tool's own for one picked up again. */
  readonly id: string
  readonly resume: boolean
  /** Claude Code's own permission mode, which it applies itself before anything is asked here. */
  readonly mode: SessionMode
  /** The model chosen under the field, in the tool's own word for it. Without one the tool runs as it is set up. */
  readonly model?: string
}

/** Several questions asked at once, being answered one card at a time. */
type Json = Readonly<Record<string, unknown>>

interface Asked {
  readonly request: ClaudeRequest
  readonly answers: Record<string, string>
  readonly questions: readonly string[]
}

export function holdClaude(
  options: ClaudeOptions,
  hear: (heard: Heard) => void,
  /** The process is gone, by itself or because it was let go. */
  left: () => void,
): Driver {
  const state = claudeState(options.root)
  const requests = new Map<string, ClaudeRequest>()
  const asked = new Map<string, Asked>()
  // Requests of ours on the control channel, waiting for the tool to answer them.
  const waiting = new Map<string, { readonly done: (answer: Json) => void; readonly refused: (why: Error) => void }>()
  let sent = 0
  let turn = false
  let turns = 0
  let over = false
  let last = ''

  const child: ChildProcessWithoutNullStreams = spawn(
    'claude',
    [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--permission-mode',
      options.mode,
      '--permission-prompt-tool',
      'stdio',
      ...(options.model === undefined ? [] : ['--model', options.model]),
      ...(options.resume ? ['--resume', options.id] : ['--session-id', options.id]),
    ],
    { cwd: options.root, stdio: ['pipe', 'pipe', 'pipe'], env: planOnly() },
  )
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve())
    child.once('error', () => resolve())
  })

  const write = (message: unknown): void => {
    if (over || !child.stdin.writable) return
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  const signals = (...heard: Signal[]): void => hear({ items: [], gone: [], signals: heard })

  /** The turn is over without the tool having said so, which only a process ending does. */
  const gaveOut = (said: string): void => {
    if (!turn) return
    turn = false
    signals({ kind: 'ended', how: 'failed', text: said })
  }

  const allow = (request: ClaudeRequest, input: Readonly<Record<string, unknown>>): void =>
    write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: request.request,
        response: { behavior: 'allow', updatedInput: input },
      },
    })

  const deny = (request: ClaudeRequest, message: string): void =>
    write({
      type: 'control_response',
      response: { subtype: 'success', request_id: request.request, response: { behavior: 'deny', message } },
    })

  createInterface({ input: child.stdout }).on('line', (line) => {
    let message: Readonly<Record<string, unknown>>
    try {
      message = JSON.parse(line) as Readonly<Record<string, unknown>>
    } catch {
      return
    }
    if (message['type'] === 'control_response') {
      const response = (message['response'] ?? {}) as Json
      const id = typeof response['request_id'] === 'string' ? response['request_id'] : ''
      const one = waiting.get(id)
      if (one === undefined) return
      waiting.delete(id)
      if (response['subtype'] === 'success') one.done((response['response'] ?? {}) as Json)
      else one.refused(new Error(typeof response['error'] === 'string' ? response['error'] : 'Claude Code refused it.'))
      return
    }
    const read = readClaude(state, message)
    const out: Signal[] = []
    for (const signal of read.signals) {
      if (signal.kind === 'ended') {
        turn = false
        turns += 1
      }
      // The tool starts a turn of its own when something in the background ends. It
      // is not taken for one before the first turn is over, when there is nothing in the background yet.
      if (signal.kind === 'started' && !turn && turns > 0) {
        turn = true
        out.push({ kind: 'begun' })
      }
      if (signal.kind !== 'asks') {
        out.push(signal)
        continue
      }
      const request = signal.request
      const questions = request.tool === 'AskUserQuestion' ? questionsFromClaude(request.input) : []
      if (questions.length > 1) {
        asked.set(request.toolUse, {
          request,
          answers: {},
          questions: questions.map((wanted) => (wanted.kind === 'question' ? wanted.question : '')),
        })
      }
      requests.set(request.toolUse, request)
      out.push({ kind: 'asks', ask: request.toolUse, wanted: request.wanted, line: request.toolUse })
    }
    hear({ items: read.items, gone: read.gone, signals: out })
  })

  // Kept for the one case it is wanted: a process that ends with nothing said
  // on the channel it was meant to speak on.
  child.stderr.on('data', (chunk: Buffer) => {
    last = `${last}${chunk.toString('utf8')}`.slice(-2_000)
  })

  const unanswered = (): void => {
    for (const one of waiting.values()) one.refused(new Error('Claude Code has stopped.'))
    waiting.clear()
  }
  child.on('error', (error) => {
    over = true
    unanswered()
    gaveOut(error.message)
    left()
  })
  child.on('close', () => {
    unanswered()
    if (over) return
    over = true
    gaveOut(last.trim())
    left()
  })
  // A pipe that closes under a write is the process having gone, which `close` says.
  child.stdin.on('error', () => undefined)

  return {
    send(text, images = [], before = []) {
      turn = true
      // A message with pictures or commands ahead of it is sent as blocks,
      // which is the only shape that can carry them; plain text stays plain text.
      const content =
        images.length === 0 && before.length === 0
          ? text
          : [
              ...[...before, ...(text.trim() === '' ? [] : [text])].map((one) => ({ type: 'text', text: one })),
              ...images.map((one) => ({
                type: 'image',
                source: { type: 'base64', media_type: one.media, data: one.data },
              })),
            ]
      write({ type: 'user', message: { role: 'user', content } })
    },

    answer(ask, answer: CardAnswer | string) {
      const [use = ask, at = '0'] = ask.split('#')
      const request = requests.get(use)
      if (request === undefined) return

      const several = asked.get(use)
      if (several !== undefined) {
        const index = Number(at)
        several.answers[several.questions[index] ?? ''] = answer
        const next = index + 1
        const wanted = questionsFromClaude(request.input)[next]
        if (wanted !== undefined) {
          signals({ kind: 'asks', ask: askId(use, next), wanted })
          return
        }
        asked.delete(use)
        requests.delete(use)
        allow(request, { ...request.input, answers: several.answers })
        return
      }

      requests.delete(use)
      if (request.wanted.kind === 'question') {
        allow(request, { ...request.input, answers: { [request.wanted.question]: answer } })
      } else if (answer === 'no') {
        deny(request, REFUSED)
      } else {
        allow(request, request.input)
      }
    },

    permit(mode, again) {
      write({ type: 'control_request', request_id: `mode-${String(Date.now())}`, request: { subtype: 'set_permission_mode', mode } })
      for (const ask of again) {
        const request = requests.get(ask)
        if (request === undefined) continue
        requests.delete(ask)
        deny(request, AGAIN)
      }
    },

    control(request) {
      if (over) return Promise.reject(new Error('Claude Code has stopped.'))
      const id = `ask-${String(++sent)}`
      return new Promise((done, refused) => {
        waiting.set(id, { done, refused })
        write({ type: 'control_request', request_id: id, request })
      })
    },

    stop() {
      requests.clear()
      asked.clear()
      write({
        type: 'control_request',
        request_id: `stop-${String(Date.now())}`,
        request: { subtype: 'interrupt' },
      })
    },

    end() {
      if (over) return closed
      over = true
      child.stdin.end()
      child.kill()
      left()
      return closed
    },
  }
}
