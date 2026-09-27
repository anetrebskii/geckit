import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

/**
 * Fetching what a conversation grew by, with `runOn` itself stood in for so
 * this never opens a real connection: what matters here is that two fetches
 * for the same file never run at once, and that a failed one tells `Hosts`
 * the host's own connection - not the script - is what went wrong.
 */
vi.mock('../src/main/hosts/ssh', () => ({ runOn: vi.fn() }))

import { HostDisk } from '../src/main/hosts/disk'
import { runOn } from '../src/main/hosts/ssh'
import { remoteRoot } from '../src/shared/hosts'

const fakeHost = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' as const }
const root = remoteRoot('devbox', '/home/leo/trailmap')

describe("bringing a conversation's mirror up to date", () => {
  it('never runs two fetches for the same file at once', async () => {
    vi.mocked(runOn).mockReset()
    const folder = await mkdtemp(join(tmpdir(), 'geckit-mirror-'))
    try {
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'up' as const }
      const disk = new HostDisk(hosts, folder)
      let inFlight = 0
      let overlapped = false
      let total = 0
      const grown = Buffer.from(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })}\n`)
      vi.mocked(runOn).mockImplementation(async () => {
        inFlight += 1
        if (inFlight > 1) overlapped = true
        await new Promise((done) => setTimeout(done, 20))
        inFlight -= 1
        // Each fetch reports the size it leaves the mirror at, as a real host's growing file would.
        total += grown.length
        return { code: 0, out: Buffer.concat([Buffer.from(`@@size ${String(total)}\n`), grown]), err: '' }
      })
      await Promise.all([disk.read(root, 'a-1'), disk.read(root, 'a-1'), disk.goal(root, 'a-1')])
      expect(overlapped).toBe(false)
      expect(runOn).toHaveBeenCalledTimes(3)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it("drops what is kept and fetches whole again where the host's own copy is now smaller", async () => {
    vi.mocked(runOn).mockReset()
    const folder = await mkdtemp(join(tmpdir(), 'geckit-mirror-'))
    try {
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'up' as const }
      const disk = new HostDisk(hosts, folder)
      const first = Buffer.from(
        `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'one' } })}\n${JSON.stringify({ type: 'user', message: { role: 'user', content: 'two' } })}\n`,
      )
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.concat([Buffer.from(`@@size ${String(first.length)}\n`), first]), err: '' })
      await disk.read(root, 'a-1')
      // The host says the file is now shorter than what was kept: begun again, not merely grown.
      const shorter = Buffer.from(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'new' } })}\n`)
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.from(`@@size ${String(shorter.length)}\n`), err: '' })
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.concat([Buffer.from(`@@size ${String(shorter.length)}\n`), shorter]), err: '' })
      const conversation = await disk.read(root, 'a-1')
      expect(conversation?.items.some((item) => item.kind === 'mine')).toBe(true)
      expect(runOn).toHaveBeenCalledTimes(3)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it("tells the host its own connection failed, not the script, on ssh's own exit code", async () => {
    vi.mocked(runOn).mockReset()
    const folder = await mkdtemp(join(tmpdir(), 'geckit-mirror-'))
    try {
      const noteFailure = vi.fn()
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'up' as const, noteFailure }
      const disk = new HostDisk(hosts, folder)
      vi.mocked(runOn).mockResolvedValueOnce({ code: 255, out: Buffer.alloc(0), err: 'ssh: connect to host devbox port 22: Operation timed out' })
      await disk.read(root, 'a-1')
      expect(noteFailure).toHaveBeenCalledWith('devbox', expect.objectContaining({ code: 255 }))
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
