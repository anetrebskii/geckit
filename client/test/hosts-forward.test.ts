import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

/**
 * A forward's own ssh stood in for so nothing is really spawned: what matters
 * here is that one never proven ready by its own deadline is not left running
 * and later handed out as if it were open. Real time, not faked: the ready
 * check polls a real loopback port, which fake timers cannot stand in for.
 */
vi.mock('../src/main/hosts/ssh', () => ({ spawnOn: vi.fn() }))

import { Forwards } from '../src/main/hosts/forward'
import type { Hosts } from '../src/main/hosts/hosts'
import { spawnOn } from '../src/main/hosts/ssh'

const fakeHost = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' as const }

/** Stands in for the ssh child a forward runs: never actually listens anywhere, so the port picked never answers. */
function unreadyChild(): ReturnType<typeof spawnOn> {
  const child = new EventEmitter()
  return Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, conn: 'c', kill: vi.fn() }) as unknown as ReturnType<
    typeof spawnOn
  >
}

describe('a forward not proven ready by its own deadline', () => {
  it(
    'is killed and let go of, rather than left running and later handed out as open',
    async () => {
      const child = unreadyChild()
      vi.mocked(spawnOn).mockReturnValueOnce(child)
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }) } as unknown as Hosts
      const forwards = new Forwards(hosts)

      await expect(forwards.open('devbox', 34_567)).resolves.toBeUndefined()
      expect(child.kill).toHaveBeenCalled()

      // Asked again: a fresh attempt is made rather than the dead one handed back as open.
      const second = unreadyChild()
      vi.mocked(spawnOn).mockReturnValueOnce(second)
      await expect(forwards.open('devbox', 34_567)).resolves.toBeUndefined()
      expect(spawnOn).toHaveBeenCalledTimes(2)
    },
    25_000,
  )
})
