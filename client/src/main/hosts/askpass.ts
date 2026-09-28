import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { HostPrompt } from '../../shared/hosts'

/**
 * What ssh asks, brought to GeckIt.
 *
 * With no terminal to ask in, OpenSSH runs the program in `SSH_ASKPASS` with
 * the question as its argument and takes what it prints as the answer. That
 * program is GeckIt's own binary run as Node on a few lines written here,
 * which carry the question over a socket only this process listens on, with a
 * token made at start, and print what comes back. Nothing it is told is kept.
 */

const WINDOWS = process.platform === 'win32'

/**
 * The helper ssh runs, in plain Node: one question out, one answer back, exit
 * 1 for none. It carries `GECKIT_ASKPASS_CONN`, minted before ssh itself was
 * even spawned (see `ssh.ts`), so which connection is asking is known even on
 * Windows, where the launcher's own cmd.exe - not ssh - is its real parent.
 *
 * On every other platform its parent process is ssh itself, so it also polls
 * that pid: ssh killed mid-prompt (a command's own timeout, say) does not
 * send this a signal of its own - only its parent going - and a helper left
 * running would hold the socket open forever, so `abandoned` never fires and
 * whatever was waiting on the question never learns it must stop. Killing
 * itself once the parent is gone closes the socket instead, which does.
 */
const HELPER = `const net = require('node:net')
const socket = net.connect(process.env.GECKIT_ASKPASS_SOCKET)
let got = ''
socket.on('connect', () => socket.write(JSON.stringify({ token: process.env.GECKIT_ASKPASS_TOKEN, host: process.env.GECKIT_HOST || '', prompt: process.argv.slice(2).join(' '), conn: process.env.GECKIT_ASKPASS_CONN || '' }) + '\\n'))
socket.on('data', (chunk) => { got += chunk.toString('utf8') })
socket.on('end', () => {
  try {
    const said = JSON.parse(got)
    if (typeof said.answer === 'string') { process.stdout.write(said.answer + '\\n'); process.exit(0) }
  } catch {}
  process.exit(1)
})
socket.on('error', () => process.exit(1))
if (process.platform !== 'win32') {
  const parent = process.ppid
  const watch = setInterval(() => {
    try { process.kill(parent, 0) } catch { process.exit(1) }
  }, 1000)
  watch.unref()
}
`

/** What a question from ssh is, read from its words, and the card that asks it. */
export function readPrompt(prompt: string, name: string, fallbackUser: string): Omit<HostPrompt, 'id' | 'host'> {
  const said = prompt.trim()
  if (/continue connecting|authenticity of host/i.test(said)) {
    const print = /(SHA256:[A-Za-z0-9+/=]+)/.exec(said)?.[1]
    return print === undefined
      ? { kind: 'trust', text: `${name} did not show its key's fingerprint. Trust it only if you expected this.` }
      : { kind: 'trust', text: `This is the first connection to ${name}. Its key is ${print}. Trust it?`, detail: print }
  }
  const key = /passphrase for (?:key )?['"]?([^'":]+)['"]?/i.exec(said)?.[1]
  if (key !== undefined) return { kind: 'passphrase', text: `${name} asks for the passphrase of ${tilde(key.trim())}.`, detail: tilde(key.trim()) }
  if (/verification code|one-time|otp|authenticator|token code/i.test(said)) return { kind: 'code', text: `${name} asks for a one-time code.` }
  if (/password/i.test(said)) {
    const user = /^([^@\s']+)@[^']*'s password/i.exec(said)?.[1] ?? /password for ([^\s:]+)/i.exec(said)?.[1] ?? fallbackUser
    return { kind: 'password', text: user === '' ? `${name} asks for a password.` : `${name} asks for the password of ${user}.` }
  }
  return { kind: 'other', text: `${name} asks: ${said}` }
}

/** A path under the home folder, written with ~ as a person writes it. */
function tilde(path: string): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
  return home !== '' && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

export interface Asker {
  /** What every ssh is started with. */
  readonly env: Readonly<Record<string, string>>
  close(): void
}

/**
 * Listens for the helper and hands each question to `ask`, which answers with
 * the words or with nothing for Not now. `ask` is given a way to register
 * what to do if the ssh that asked is gone before it answers - killed by its
 * own command's timeout, most often - so whatever is waiting on it is not
 * left waiting on a connection that no longer exists.
 */
export function startAskpass(
  folder: string,
  executable: string,
  ask: (host: string, prompt: string, conn: string, abandoned: (fn: () => void) => void) => Promise<string | undefined>,
): Asker {
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const token = randomBytes(24).toString('hex')
  const socket = WINDOWS
    ? `\\\\.\\pipe\\geckit-askpass-${String(process.pid)}-${randomBytes(4).toString('hex')}`
    : join(tmpdir(), `geckit-askpass-${String(process.pid)}.sock`)
  if (!WINDOWS) rmSync(socket, { force: true })

  const helper = join(folder, 'askpass.cjs')
  writeFileSync(helper, HELPER, { mode: 0o600 })
  const launcher = join(folder, WINDOWS ? 'askpass.cmd' : 'askpass.sh')
  if (WINDOWS) {
    writeFileSync(launcher, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${executable}" "${helper}" %*\r\n`)
  } else {
    writeFileSync(launcher, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${executable}" "${helper}" "$@"\n`)
    chmodSync(launcher, 0o700)
  }

  const server: Server = createServer((connection) => {
    let got = ''
    let settled = false
    let onGone: (() => void) | undefined
    connection.on('close', () => {
      if (!settled) onGone?.()
    })
    connection.on('data', (chunk: Buffer) => {
      got += chunk.toString('utf8')
      const end = got.indexOf('\n')
      if (end < 0) return
      let asked: { token?: unknown; host?: unknown; prompt?: unknown; conn?: unknown } = {}
      try {
        asked = JSON.parse(got.slice(0, end)) as typeof asked
      } catch {
        connection.end()
        return
      }
      if (asked.token !== token || typeof asked.prompt !== 'string' || typeof asked.host !== 'string' || typeof asked.conn !== 'string') {
        connection.end()
        return
      }
      void ask(asked.host, asked.prompt, asked.conn, (fn) => (onGone = fn))
        .catch(() => undefined)
        .then((answer) => {
          settled = true
          connection.end(JSON.stringify(answer === undefined ? {} : { answer }))
        })
    })
    connection.on('error', () => undefined)
  })
  server.on('error', () => undefined)
  server.listen(socket)
  if (!WINDOWS) {
    server.on('listening', () => {
      try {
        chmodSync(socket, 0o600)
      } catch {
        // A socket that cannot be narrowed still asks for the token.
      }
    })
  }

  return {
    env: {
      SSH_ASKPASS: launcher,
      SSH_ASKPASS_REQUIRE: 'force',
      // Older ssh asks only where it thinks there is a screen to ask on.
      DISPLAY: process.env['DISPLAY'] ?? ':0',
      GECKIT_ASKPASS_SOCKET: socket,
      GECKIT_ASKPASS_TOKEN: token,
    },
    close() {
      server.close()
      if (!WINDOWS) rmSync(socket, { force: true })
    },
  }
}
