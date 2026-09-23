import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import type { Browser } from '../../shared/api'
import { planOnly } from './account'

/**
 * The Chromes the extension is signed in to, and which one Claude uses.
 *
 * A Chrome profile is its own browser to the extension, so somebody signed in
 * to two of them has two here. The choice is Claude Code's own, kept where
 * `/chrome` in a terminal keeps it, so it holds for every conversation from
 * its next start. Asked of a process in the folder that is given no message,
 * so nothing is sent to a model.
 */

type Json = Readonly<Record<string, unknown>>

const PATIENCE = 20_000

const string = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** The browsers out of the tool's answer to `get_chrome_browsers`. */
export const browsersOf = (answer: Json): Browser[] =>
  (Array.isArray(answer['browsers']) ? (answer['browsers'] as unknown[]) : []).flatMap((one) => {
    const browser = (one ?? {}) as Json
    const id = string(browser['device_id'])
    return id === undefined ? [] : [{ id, name: string(browser['name']) ?? id, current: browser['current'] === true }]
  })

export function readBrowsers(root: string, pick?: string): Promise<Browser[] | undefined> {
  return new Promise((done) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--chrome',
        '--no-session-persistence',
        '--settings',
        JSON.stringify({ disableAllHooks: true }),
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'ignore'], env: planOnly() },
    )
    let browsers: Browser[] | undefined
    let over = false
    const finish = (): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      child.stdin.end()
      child.kill()
      done(browsers)
    }
    const patience = setTimeout(finish, PATIENCE)
    const ask = (id: string, request: Json): void => {
      child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: id, request })}\n`)
    }

    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: Json
      try {
        message = JSON.parse(line) as Json
      } catch {
        return
      }
      if (message['type'] !== 'control_response') return
      const response = (message['response'] ?? {}) as Json
      // Picked or refused, what the browsers are now is what is shown.
      if (response['request_id'] === 'pick') return ask('list', { subtype: 'get_chrome_browsers' })
      if (response['request_id'] !== 'list' || response['subtype'] !== 'success') return finish()
      browsers = browsersOf((response['response'] ?? {}) as Json)
      finish()
    })
    child.on('error', finish)
    child.on('close', finish)
    child.stdin.on('error', () => undefined)
    if (pick === undefined) ask('list', { subtype: 'get_chrome_browsers' })
    else ask('pick', { subtype: 'select_chrome_browser', device_id: pick })
  })
}
