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

/** How long a forward is given to prove itself, from ssh starting to the port taking a connection: long enough for a card to be answered. */
const READY_WITHIN = 10_000
const POLL_EVERY = 300

/** The `-L` value for a forward, bound to loopback by name rather than left to ssh's own default, which is not the same on every platform. */
export const bindSpec = (local: number, port: number): string => `127.0.0.1:${String(local)}:localhost:${String(port)}`

export class Forwards {
  readonly #hosts: Hosts
  readonly #open = new Map<string, { readonly local: number; readonly child: ChildProcessWithoutNullStreams }>()
  /** One open() at a time per host and port: the second waits on the first rather than starting a forward of its own. */
  readonly #opening = new Map<string, Promise<number | undefined>>()

  constructor(hosts: Hosts) {
    this.#hosts = hosts
  }

  /** The port on this computer that reaches `port` on the host, opened if it is not yet. */
  open(id: string, port: number): Promise<number | undefined> {
    const key = `${id}:${String(port)}`
    const was = this.#open.get(key)
    if (was !== undefined && was.child.exitCode === null) return Promise.resolve(was.local)
    const already = this.#opening.get(key)
    if (already !== undefined) return already
    const opening = this.#openNow(key, id, port).finally(() => {
      if (this.#opening.get(key) === opening) this.#opening.delete(key)
    })
    this.#opening.set(key, opening)
    return opening
  }

  async #openNow(key: string, id: string, port: number): Promise<number | undefined> {
    const host = this.#hosts.config(id)
    if (host === undefined) return undefined
    let local = port < 1024 ? 8000 + port : port
    while (!(await free(local)) && local < 65535) local += 1
    const child = spawnOn(host, this.#hosts.setup(), '', { forward: bindSpec(local, port), alone: true })
    child.stdin.end()
    this.#open.set(key, { local, child })
    child.once('close', () => {
      if (this.#open.get(key)?.child === child) this.#open.delete(key)
    })
    // Ready once the port itself takes a connection, not merely once ssh has not yet failed: a password host puts a card up first, and the port is not there until it is answered.
    const ready = await new Promise<boolean>((done) => {
      let settled = false
      const finish = (yes: boolean): void => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(limit)
        done(yes)
      }
      child.once('close', () => finish(false))
      const poll = setInterval(() => {
        void answers(local, '127.0.0.1').then((yes) => {
          if (yes) finish(true)
        })
      }, POLL_EVERY)
      const limit = setTimeout(() => finish(false), READY_WITHIN)
    })
    if (!ready) {
      // Not proven ready by its own deadline: killed rather than left running and later handed out as open, a password host's card still up counted among them.
      child.kill()
      if (this.#open.get(key)?.child === child) this.#open.delete(key)
      return undefined
    }
    return local
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
