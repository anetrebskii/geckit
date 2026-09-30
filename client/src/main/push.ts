import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'
import log from 'electron-log'

import type { SessionNotice } from '../shared/api'
import { roomOf, seal, SIGNAL } from '../shared/pairing'

/**
 * A notice sent to the phones when none of them is open: sealed here with the
 * key in the QR code, carried by the signal function to Apple, and opened on
 * the phone, so neither Google nor Apple can read it.
 */

/** What the phone shows, cut to fit what Apple carries. */
export interface Pushed {
  readonly session: string
  readonly title: string
  readonly subtitle: string
  readonly body: string
}

const cut = (text: string, most: number): string => (text.length <= most ? text : `${text.slice(0, most - 1)}…`)

export const pushedOf = (notice: SessionNotice): Pushed => ({
  session: notice.session,
  title: cut(notice.title, 120),
  subtitle: cut(notice.subtitle, 120),
  body: cut(notice.body, 400),
})

export async function boxFor(key: string, notice: SessionNotice): Promise<{ readonly room: string; readonly box: string }> {
  return { room: await roomOf(key), box: await seal(key, pushedOf(notice)) }
}

// The phones' tokens are the pairing's: a new code leaves them behind with the phones.
interface Kept {
  readonly key: string
  readonly tokens: readonly string[]
}

const file = (): string => join(app.getPath('userData'), 'push.json')

function kept(key: string): readonly string[] {
  try {
    const found = JSON.parse(readFileSync(file(), 'utf8')) as Kept
    return found.key === key ? found.tokens : []
  } catch {
    return []
  }
}

function keep(key: string, tokens: readonly string[]): void {
  try {
    writeFileSync(file(), JSON.stringify({ key, tokens } satisfies Kept))
  } catch (error) {
    log.warn(`The phones' push tokens were not saved: ${String(error)}`)
  }
}

export function keepToken(key: string, said: string): void {
  // iOS hands the token over in capitals, and the signal function takes it in lower case.
  const token = said.toLowerCase()
  if (!/^[0-9a-f]{64,200}$/.test(token)) return
  const tokens = kept(key)
  if (!tokens.includes(token)) keep(key, [...tokens, token])
}

export async function pushTo(key: string, notice: SessionNotice): Promise<void> {
  const tokens = kept(key)
  if (tokens.length === 0) return
  const { room, box } = await boxFor(key, notice)
  for (const token of tokens) {
    try {
      const answer = await fetch(`${SIGNAL}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, token, box }),
        signal: AbortSignal.timeout(15_000),
      })
      // A phone that removed the app, or turned notifications off for good.
      if (answer.status === 410) keep(key, kept(key).filter((one) => one !== token))
      else if (!answer.ok) log.warn(`A push was not sent: ${String(answer.status)} ${await answer.text()}`)
    } catch (error) {
      log.warn(`A push was not sent: ${String(error)}`)
    }
  }
}
