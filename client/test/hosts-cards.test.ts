import { connect } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

/**
 * Two connections asking the same question at once, driven over the real
 * askpass socket (see `askpass.ts`) rather than a fake, so this covers the
 * whole path: the second joins the card the first put up, and whichever of
 * the two is the last to let go - the one that asked it, or only the one that
 * joined it - takes the card down and marks nothing left waiting on it.
 */

import { isAsking } from '../src/main/hosts/asking'
import { Hosts } from '../src/main/hosts/hosts'
import type { HostConfig } from '../src/shared/hosts'

const fakeHost: HostConfig = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'password' }

/** Writes one line of the helper's own protocol and waits for the reply, or for the connection to close first if nobody answers before `end()` below. */
function ask(socketPath: string, message: Readonly<Record<string, unknown>>): { readonly socket: ReturnType<typeof connect> } {
  const socket = connect(socketPath)
  socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`))
  socket.on('error', () => undefined)
  return { socket }
}

const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

describe('a card two connections are asking at once', () => {
  it('goes once nobody is left waiting on it, whether the last to let go asked it or only joined it', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-cards-'))
    try {
      const prompt = vi.fn()
      const answered = vi.fn()
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt,
        answered,
        secrets: { can: () => false, get: () => undefined, set: () => undefined, forget: () => undefined, has: () => false },
      })
      try {
        const { env } = hosts.setup()
        const socketPath = env['GECKIT_ASKPASS_SOCKET'] ?? ''
        const token = env['GECKIT_ASKPASS_TOKEN'] ?? ''

        const first = ask(socketPath, { token, host: 'devbox', prompt: "leo@devbox.local's password: ", conn: 'conn-a' })
        await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
        expect(hosts.prompts()).toHaveLength(1)

        // A second connection, asking the very same question, joins the card already up rather than putting up one of its own.
        const second = ask(socketPath, { token, host: 'devbox', prompt: "leo@devbox.local's password: ", conn: 'conn-b' })
        await tick()
        expect(prompt).toHaveBeenCalledTimes(1)
        expect(hosts.prompts()).toHaveLength(1)
        expect(isAsking('conn-a')).toBe(true)
        expect(isAsking('conn-b')).toBe(true)

        // The connection that asked it is killed first: the other is still waiting, so the card stands.
        first.socket.destroy()
        await tick()
        expect(hosts.prompts()).toHaveLength(1)
        expect(answered).not.toHaveBeenCalled()
        expect(isAsking('conn-a')).toBe(false)

        // The only one left is the one that only joined: the card goes once it lets go too, not left up for nobody.
        second.socket.destroy()
        await tick()
        expect(hosts.prompts()).toHaveLength(0)
        expect(answered).toHaveBeenCalledTimes(1)
        expect(isAsking('conn-b')).toBe(false)
      } finally {
        hosts.dispose()
      }
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
