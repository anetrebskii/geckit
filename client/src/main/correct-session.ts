import type { Answered } from '../shared/api'
import type { Held } from './sessions/claude'

/**
 * One `claude` holding every correction of a day, so a correction does not pay
 * for a process start. It is started at the first correction, answers them one
 * at a time, and is replaced by a fresh one when the date or the model
 * changes, or when it stops answering.
 */

/** How long one correction is waited on before the process is taken down. */
export const PATIENCE = 90_000

/** The model the session runs on when the Correct footer says Default. */
export const CORRECT_MODEL = 'haiku'

export const ALONE =
  'Every message is a separate piece of text with its own instruction. Handle each one on its own, as if it were the first. Never refer to, compare with or draw on any earlier message or answer.'

export function correctArgs(model: string): string[] {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--restricted',
    '--no-session-persistence',
    '--model',
    model,
    '--append-system-prompt',
    ALONE,
  ]
}

export const localDay = (at: Date): string => `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`

export interface CorrectKeeper {
  ask(text: string, said: string, model: string): Promise<Answered>
  stop(): void
}

interface Running {
  readonly child: Held & { kill(): unknown }
  readonly day: string
  readonly model: string
  dead: boolean
  err: string
  answer: ((answer: Answered) => void) | undefined
}

export function correctKeeper(
  launch: (args: readonly string[]) => Held & { kill(): unknown },
  now: () => Date = () => new Date(),
  patience: number = PATIENCE,
): CorrectKeeper {
  let running: Running | undefined
  let queue: Promise<unknown> = Promise.resolve()

  const end = (one: Running): void => {
    if (one.dead) return
    one.dead = true
    one.child.kill()
  }

  const give = (one: Running, answer: Answered): void => {
    const waiting = one.answer
    one.answer = undefined
    waiting?.(answer)
  }

  const start = (day: string, model: string): Running => {
    const child = launch(correctArgs(model))
    const one: Running = { child, day, model, dead: false, err: '', answer: undefined }
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      let at = out.indexOf('\n')
      while (at !== -1) {
        const line = out.slice(0, at)
        out = out.slice(at + 1)
        at = out.indexOf('\n')
        const answer = resultOf(line)
        if (answer !== undefined) give(one, answer)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      one.err = `${one.err}${chunk.toString('utf8')}`.slice(-2_000)
    })
    child.on('error', (error) => {
      one.dead = true
      give(one, {
        ok: false,
        error:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'claude is not on this machine. Install Claude Code to correct text.'
            : error.message,
      })
    })
    child.on('close', () => {
      one.dead = true
      give(one, { ok: false, error: one.err.trim() || 'claude stopped before it answered' })
    })
    child.stdin.on('error', () => undefined)
    return one
  }

  const once = (text: string, said: string, model: string): Promise<Answered> => {
    const day = localDay(now())
    const chosen = model === '' ? CORRECT_MODEL : model
    if (running !== undefined && (running.dead || running.day !== day || running.model !== chosen)) {
      end(running)
      running = undefined
    }
    const one = running ?? start(day, chosen)
    running = one
    return new Promise((done) => {
      const patient = setTimeout(() => {
        end(one)
        give(one, { ok: false, error: 'claude did not answer in time' })
      }, patience)
      one.answer = (answer) => {
        clearTimeout(patient)
        done(answer)
      }
      if (one.dead || !one.child.stdin.writable) {
        give(one, { ok: false, error: one.err.trim() || 'claude stopped before it answered' })
        return
      }
      one.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: `${said}\n\n${text}` } })}\n`)
    })
  }

  return {
    ask(text, said, model) {
      const asked = queue.then(() => once(text, said, model))
      queue = asked
      return asked
    },
    stop() {
      if (running !== undefined) end(running)
      running = undefined
    },
  }
}

/** A `result` line read as the answer to a correction; nothing for any other line. */
export function resultOf(line: string): Answered | undefined {
  let said: Readonly<Record<string, unknown>>
  try {
    said = JSON.parse(line) as Readonly<Record<string, unknown>>
  } catch {
    return undefined
  }
  if (said === null || typeof said !== 'object' || said['type'] !== 'result') return undefined
  if (said['is_error'] === true) return { ok: false, error: String(said['result'] ?? 'claude reported an error') }
  const result = typeof said['result'] === 'string' ? said['result'].trim() : ''
  return result === '' ? { ok: false, error: 'It answered with nothing' } : { ok: true, text: result }
}
