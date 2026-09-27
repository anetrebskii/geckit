import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { connect, createServer } from 'node:net'

import type { Hosts } from './hosts'
import { spawnOn } from './ssh'

/**
 * A `localhost` address said in a conversation on a host is that host's, so it
 * is carried here over its connection: the same port where it is free on this
 * computer, the next free one where it is not. One forward a host and port,
 * kept while the host is connected.
 */

/** The port a link is to, where it is to this computer's own address; nothing for any other link. */
export function localPort(href: string): number | undefined {
  const match = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::(\d+))?(?:[/?#]|$)/i.exec(href)
  if (match === null) return undefined
  const port = match[1] === undefined ? (href.startsWith('https') ? 443 : 80) : Number(match[1])
  return port >= 1 && port <= 65535 ? port : undefined
}

/** The same address with another port. */
export const withPort = (href: string, port: number): string =>
  href.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?/i, `$1localhost:${String(port)}`)

/** Whether something here answers on a port at an address. */
const answers = (port: number, host: string): Promise<boolean> =>
  new Promise((done) => {
    const probe = connect({ port, host, timeout: 500 })
    const end = (yes: boolean): void => {
      probe.destroy()
      done(yes)
    }
    probe.once('connect', () => end(true))
    probe.once('timeout', () => end(false))
    probe.once('error', () => end(false))
  })

/**
 * Whether nothing here listens on a port. A server that took the port for
 * IPv6 alone, as a dev server on macOS does for `localhost`, leaves 127.0.0.1
 * free to bind, and a browser asking for localhost would still reach it rather
 * than the host; so a port that answers on either address is taken.
 */
const free = async (port: number): Promise<boolean> => {
  if ((await answers(port, '127.0.0.1')) || (await answers(port, '::1'))) return false
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })
}

export class Forwards {
  readonly #hosts: Hosts
  readonly #open = new Map<string, { readonly local: number; readonly child: ChildProcessWithoutNullStreams }>()

  constructor(hosts: Hosts) {
    this.#hosts = hosts
  }

  /** The port on this computer that reaches `port` on the host, opened if it is not yet. */
  async open(id: string, port: number): Promise<number | undefined> {
    const key = `${id}:${String(port)}`
    const was = this.#open.get(key)
    if (was !== undefined && was.child.exitCode === null) return was.local
    const host = this.#hosts.config(id)
    if (host === undefined) return undefined
    let local = port < 1024 ? 8000 + port : port
    while (!(await free(local)) && local < 65535) local += 1
    const child = spawnOn(host, this.#hosts.setup(), '', { forward: `${String(local)}:localhost:${String(port)}`, alone: true })
    child.stdin.end()
    this.#open.set(key, { local, child })
    child.once('close', () => {
      if (this.#open.get(key)?.child === child) this.#open.delete(key)
    })
    // The forward is ready once ssh has not failed to make it within a moment.
    const failed = await new Promise<boolean>((done) => {
      const timer = setTimeout(() => done(false), 1_500)
      child.once('close', () => {
        clearTimeout(timer)
        done(true)
      })
    })
    return failed ? undefined : local
  }

  closeHost(id: string): void {
    for (const [key, one] of this.#open) {
      if (!key.startsWith(`${id}:`)) continue
      one.child.kill()
      this.#open.delete(key)
    }
  }

  dispose(): void {
    for (const one of this.#open.values()) one.child.kill()
    this.#open.clear()
  }
}
