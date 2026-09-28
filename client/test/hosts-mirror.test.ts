import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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
import { slug } from '../src/main/sessions/disk'
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

  it('drops a deleted conversation from the listing kept for when the host is not connected, so has() stops saying it is there', async () => {
    vi.mocked(runOn).mockReset()
    const folder = await mkdtemp(join(tmpdir(), 'geckit-mirror-'))
    try {
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'up' as const }
      const disk = new HostDisk(hosts, folder)
      const path = join(folder, fakeHost.id, 'listed', `${slug('/home/leo/trailmap')}.json`)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify([{ id: 'a-1', title: 'Kept', stands: '', at: 5, driven: false }]))
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.alloc(0), err: '' })
      const ok = await disk.delete(root, 'a-1')
      expect(ok).toBe(true)
      // Not connected any more: has() answers from the cached listing alone, which must no longer carry the deleted row.
      const asleep = new HostDisk({ config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'lost' as const }, folder)
      await expect(asleep.has(root, 'a-1')).resolves.toBe(false)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('never lands a fetch already in flight after a delete for the same file', async () => {
    vi.mocked(runOn).mockReset()
    const folder = await mkdtemp(join(tmpdir(), 'geckit-mirror-'))
    try {
      const hosts = { config: () => fakeHost, setup: () => ({ env: {} }), state: () => 'up' as const }
      const disk = new HostDisk(hosts, folder)
      const grown = Buffer.from(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })}\n`)
      let resolveFetch: (() => void) | undefined
      vi.mocked(runOn).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveFetch = () => done({ code: 0, out: Buffer.concat([Buffer.from(`@@size ${String(grown.length)}\n`), grown]), err: '' })
          }),
      )
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.alloc(0), err: '' })
      vi.mocked(runOn).mockResolvedValueOnce({ code: 0, out: Buffer.from('no'), err: '' })
      const fetching = disk.read(root, 'a-1')
      await new Promise((done) => setTimeout(done, 5))
      const deleting = disk.delete(root, 'a-1')
      resolveFetch?.()
      await Promise.all([fetching, deleting])
      // The delete's own rm() only ran once the fetch that was already in flight had landed, so it did not bring the mirror back after the delete removed it.
      await expect(disk.has(root, 'a-1')).resolves.toBe(false)
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
