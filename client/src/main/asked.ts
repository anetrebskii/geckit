import { rmSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { join } from 'node:path'

import { app } from 'electron'
import log from 'electron-log'

import type { RequestAnswered } from './sessions'

/**
 * Where `geckit start` reaches the running application. One line of JSON in,
 * one line out once the person has answered, so the command waits for them
 * and nothing starts without them. The command ending first withdraws what
 * it asked for.
 */

export interface StartAsked {
  /** The Claude Code session that asked, from its own CLAUDE_CODE_SESSION_ID. */
  readonly from?: string
  readonly tasks: readonly { readonly project: string; readonly title?: string; readonly text: string; readonly goal?: string }[]
}

export type StartAnswered = { readonly ok: false; readonly error: string } | ({ readonly ok: true } & RequestAnswered)

export const askedPath = (): string => join(app.getPath('userData'), 'geckit.sock')

export function listenAsked(answer: (asked: StartAsked, gone: AbortSignal) => Promise<StartAnswered>): Server {
  const path = askedPath()
  rmSync(path, { force: true })
  const server = createServer((socket) => {
    const gone = new AbortController()
    socket.on('close', () => gone.abort())
    let rest = ''
    socket.setEncoding('utf8')
    socket.on('data', (part: string) => {
      rest += part
      const end = rest.indexOf('\n')
      if (end < 0) return
      const line = rest.slice(0, end)
      rest = ''
      let asked: StartAsked
      try {
        asked = JSON.parse(line) as StartAsked
      } catch {
        socket.end(`${JSON.stringify({ ok: false, error: 'That was not a request GeckIt reads.' })}\n`)
        return
      }
      void answer(asked, gone.signal)
        .catch((error: unknown): StartAnswered => ({ ok: false, error: String(error) }))
        .then((said) => socket.end(`${JSON.stringify(said)}\n`))
    })
    socket.on('error', () => undefined)
  })
  server.on('error', (error) => log.warn(`geckit start cannot be listened for: ${String(error)}`))
  server.listen(path)
  return server
}

export function closeAsked(server: Server | undefined): void {
  server?.close()
  rmSync(askedPath(), { force: true })
}
