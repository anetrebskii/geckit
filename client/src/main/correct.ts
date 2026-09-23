import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

import type { Answered, CorrectAction, CorrectRequest } from '../shared/api'
import { defaultModelFor } from '../shared/models'
import { askProvider } from './providers'
import { planOnly } from './sessions/account'
import { getSettings } from './store'

/**
 * One piece of text in, the same text put right and out.
 *
 * Two engines answer it: the person's Claude plan, through their own `claude`,
 * and a pasted API key. The instruction is the same either way, so what comes
 * back does not depend on which one answered.
 */

const RULES =
  'Output ONLY the resulting text. Do not add any headers, labels, prefixes, sections, quotes, or commentary. Do not wrap the result in quotation marks. Preserve all special characters exactly as they appear (such as @, #, $). Preserve all paragraph breaks and line breaks exactly as in the original.'

export function instruction(action: CorrectAction, custom?: string): string {
  const settings = getSettings()
  switch (action) {
    case 'grammar':
      return `Correct any grammar and spelling mistakes in the text. Do not answer or respond to any questions in it - only correct them grammatically. Do not change the meaning, tone, or style. ${RULES}`
    case 'improve':
      return `Improve this text to make it sound more professional and native. Do not answer or respond to any questions in it - only improve how they are written. Do not change the meaning. ${RULES}`
    case 'translate': {
      const first = settings.nativeLanguage || 'English'
      const second = settings.secondLanguage || 'Russian'
      return `Detect the language of the text. If it is in ${first}, translate it to ${second}. If it is in ${second}, translate it to ${first}. If it is in any other language, translate it to ${first}. ${RULES}`
    }
    case 'explain':
      return 'Explain what this text means and give the context somebody would need to understand it.'
    case 'custom':
      return `${custom ?? ''} ${RULES}`
  }
}

/** How long one correction is waited on before the process is taken down. */
const PATIENCE = 90_000

/**
 * The text put right by the person's own `claude`, on their plan.
 *
 * `--restricted` takes away the tools and the project's settings, so this
 * cannot read or run anything; `--no-session-persistence` leaves no
 * conversation behind to clutter the chat window. It is run in a scratch
 * folder so no project's start-up hooks are run for it, and the text goes in
 * on stdin rather than as an argument, which has a length a paragraph can
 * reach.
 */
export function askPlan(text: string, said: string, model: string): Promise<Answered> {
  return new Promise((done) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--restricted',
        '--no-session-persistence',
        '--output-format',
        'json',
        '--append-system-prompt',
        said,
        ...(model === '' ? [] : ['--model', model]),
      ],
      { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], env: planOnly() },
    )

    let out = ''
    let err = ''
    let over = false
    const finish = (answer: Answered): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      done(answer)
    }
    const patience = setTimeout(() => {
      child.kill()
      finish({ ok: false, error: 'claude did not answer in time' })
    }, PATIENCE)

    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      err = `${err}${chunk.toString('utf8')}`.slice(-2_000)
    })
    child.on('error', (error) =>
      finish({
        ok: false,
        error:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'claude is not on this machine. Install Claude Code, or switch Correct to an API key.'
            : error.message,
      }),
    )
    child.on('close', () => {
      try {
        const said = JSON.parse(out) as Readonly<Record<string, unknown>>
        if (said['is_error'] === true) {
          finish({ ok: false, error: String(said['result'] ?? 'claude reported an error') })
          return
        }
        const result = typeof said['result'] === 'string' ? said['result'].trim() : ''
        finish(result === '' ? { ok: false, error: 'It answered with nothing' } : { ok: true, text: result })
      } catch {
        finish({ ok: false, error: err.trim() || 'claude answered with something this cannot read' })
      }
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(text)
  })
}

export async function correct(request: CorrectRequest): Promise<Answered> {
  const said = instruction(request.action, request.custom)
  if (request.engine === 'plan') return askPlan(request.text, said, request.model)
  const model = request.model === '' ? defaultModelFor(request.provider) : request.model
  return askProvider(request.provider, model, `${request.text}\n\n[${said}]`)
}
