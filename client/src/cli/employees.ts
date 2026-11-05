import { readFileSync } from 'node:fs'
import { connect } from 'node:net'

import type { EmployeesCliAnswered, EmployeesCliAsked } from '../shared/employees'
import { askedEndpoint } from './endpoint'
import { requestingSession } from './start'

const READS = new Set(['list', 'current', 'show', 'memory', 'tasks', 'shortcuts'])
const FILES: Readonly<Partial<Record<string, string>>> = { '--prompt-file': '--prompt', '--description-file': '--description', '--instructions-file': '--instructions' }

/** `--prompt-file`, `--description-file` and `--instructions-file` read here, where the file is, and sent as the text they hold. */
export function withFiles(args: readonly string[], read: (file: string) => string): readonly string[] {
  const out: string[] = []
  for (let at = 0; at < args.length; at++) {
    const one = args[at] ?? ''
    const flag = FILES[one]
    if (flag === undefined) { out.push(one); continue }
    const file = args[at + 1]
    if (file === undefined) throw new Error(`${one} needs a file.`)
    let text: string
    try { text = read(file) } catch { throw new Error(`Could not read ${file === '-' ? 'stdin' : file}.`) }
    out.push(flag, text)
    at++
  }
  return out
}

export function readEmployees(args: readonly string[], directory: string): Promise<{ readonly said: string; readonly ok: boolean }> {
  let sent: readonly string[]
  try { sent = withFiles(args, (file) => readFileSync(file === '-' ? 0 : file, 'utf8')) }
  catch (error) { return Promise.resolve({ ok: false, said: error instanceof Error ? error.message : String(error) }) }
  const session = requestingSession()
  const request: EmployeesCliAsked = { action: 'employees', args: sent, ...(session === undefined ? {} : { session }) }
  return new Promise((resolve) => {
    const socket = connect(askedEndpoint(directory))
    let received = ''
    socket.setEncoding('utf8')
    // Only unrelated team changes wait for the person's decision.
    if (READS.has(args[0] ?? '') || args[0] === 'manager' || args[0] === 'shortcut' || session === undefined) socket.setTimeout(55_000, () => socket.destroy(new Error('GeckIt did not answer the employee command.')))
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (part: string) => { received += part })
    socket.on('error', (error: Error) => resolve({ ok: false, said: error.message }))
    socket.on('end', () => {
      try {
        const answer = JSON.parse(received) as EmployeesCliAnswered
        resolve(answer.ok ? { ok: true, said: answer.result } : { ok: false, said: answer.error })
      } catch { resolve({ ok: false, said: 'GeckIt closed before answering the employee command.' }) }
    })
  })
}
