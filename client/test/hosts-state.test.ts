import { connect } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as SshModule from '../src/main/hosts/ssh'

/**
 * How a host's shown state lags what it truly is: never really reached, a
 * check made real over `runOn` mocked, so a drop and its retries run to a
 * fake clock instead of a real network. What ssh asks is still driven over
 * the real askpass socket (see `hosts-cards.test.ts`), since that is its own
 * path and not `runOn`'s.
 */

vi.mock('../src/main/hosts/ssh', async (importOriginal) => {
  const actual = await importOriginal<typeof SshModule>()
  return { ...actual, runOn: vi.fn(), sshConfigTarget: vi.fn() }
})

import { Hosts } from '../src/main/hosts/hosts'
import { runOn, sshConfigTarget } from '../src/main/hosts/ssh'
import type { HostConfig, HostView } from '../src/shared/hosts'

const fakeHost: HostConfig = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' }
const fakeSecrets = { can: () => false, get: () => undefined, set: () => undefined, forget: () => undefined, has: () => false }

const goodRan = { code: 0, out: Buffer.from('@@path /x\n@@version\n2.1.283\n@@auth\n{"loggedIn": true, "subscriptionType": "max"}\n@@end\n'), err: '' }
const timeoutRan = { code: 255, out: Buffer.alloc(0), err: 'ssh: connect to host devbox port 22: Operation timed out' }
const changedKeyRan = {
  code: 255,
  out: Buffer.alloc(0),
  err: '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nThe fingerprint for the ED25519 key sent by the remote host is\nSHA256:88eNewKey02d.\nHost key verification failed.',
}

/** A folder for the askpass helper's own files, thrown away once the test is done. */
async function withFolder<T>(run: (folder: string) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), 'geckit-state-'))
  try {
    return await run(folder)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

const view = (views: readonly HostView[]): HostView | undefined => views.find((one) => one.id === fakeHost.id)

describe('a host never up in this run', () => {
  it('is told outright why it could not be reached, rather than left Lost forever with no reason', async () => {
    await withFolder(async (folder) => {
      vi.mocked(runOn).mockResolvedValue(timeoutRan)
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        await hosts.connect(fakeHost.id)
        expect(hosts.state(fakeHost.id)).toBe('needs')
        expect(view(hosts.views())?.problem).toBe('Could not reach devbox: timed out after 20 s.')
      } finally {
        hosts.dispose()
      }
    })
  })
})

describe('a host that was up and dropped', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing new for the 10 s grace, never flickers through Connecting meanwhile, and becomes Lost only once it runs out', async () => {
    await withFolder(async (folder) => {
      const seen: string[] = []
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: (views) => {
          const one = view(views)
          if (one !== undefined) seen.push(one.state)
        },
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        vi.mocked(runOn).mockResolvedValueOnce(goodRan)
        await hosts.connect(fakeHost.id)
        expect(hosts.state(fakeHost.id)).toBe('up')

        vi.useFakeTimers()
        vi.mocked(runOn).mockResolvedValue(timeoutRan)
        seen.length = 0
        hosts.noteFailure(fakeHost.id, { code: 255, err: 'Broken pipe', out: Buffer.alloc(0) })
        await vi.advanceTimersByTimeAsync(0)
        // Lost underneath at once, but nothing shown says so yet.
        expect(hosts.state(fakeHost.id)).toBe('up')

        await vi.advanceTimersByTimeAsync(9_000)
        expect(hosts.state(fakeHost.id)).toBe('up')
        expect(seen).not.toContain('connecting')
        expect(seen).not.toContain('lost')

        await vi.advanceTimersByTimeAsync(1_100)
        expect(hosts.state(fakeHost.id)).toBe('lost')
        expect(view(hosts.views())?.problem).toBeUndefined()
      } finally {
        hosts.dispose()
      }
    })
  })

  it('keeps retrying in silence at first, and only past 5 failed retries keeps the reason for stateLine to say it is out of reach', async () => {
    await withFolder(async (folder) => {
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        vi.mocked(runOn).mockResolvedValueOnce(goodRan)
        await hosts.connect(fakeHost.id)

        vi.useFakeTimers()
        vi.mocked(runOn).mockResolvedValue(timeoutRan)
        hosts.noteFailure(fakeHost.id, { code: 255, err: 'Broken pipe', out: Buffer.alloc(0) })
        await vi.advanceTimersByTimeAsync(0)
        // Retries at 1, 2, 4, 8, then 15 s: the reason is still not kept through the fifth attempt overall (four retries).
        await vi.advanceTimersByTimeAsync(14_000)
        expect(view(hosts.views())?.problem).toBeUndefined()
        // The sixth attempt (the fifth retry) is the one that finally keeps it.
        await vi.advanceTimersByTimeAsync(16_000)
        expect(view(hosts.views())?.problem).toBe('Could not reach devbox: timed out after 20 s.')
        // A further retry past that keeps saying so too, rather than losing it again each time `#check` moves back through `connecting` on its way to trying once more.
        await vi.advanceTimersByTimeAsync(30_000)
        expect(view(hosts.views())?.problem).toBe('Could not reach devbox: timed out after 20 s.')
      } finally {
        hosts.dispose()
      }
    })
  }, 15_000)
})

describe("a host's key that changed", () => {
  it('is put in Needs you with the new fingerprint kept for the card, rather than folded into the generic sign-in wording', async () => {
    await withFolder(async (folder) => {
      vi.mocked(runOn).mockResolvedValue(changedKeyRan)
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        await hosts.connect(fakeHost.id)
        const found = view(hosts.views())
        expect(found?.state).toBe('needs')
        expect(found?.problem).toBe("devbox's key has changed since the last connection. That can mean the host was set up again, or that something is in the way.")
        expect(found?.changedKey).toEqual({ print: 'SHA256:88eNewKey02d' })
      } finally {
        hosts.dispose()
      }
    })
  })
})

describe("Not now resets a drop's own backoff", () => {
  function ask(socketPath: string, message: Readonly<Record<string, unknown>>): void {
    const socket = connect(socketPath)
    socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`))
    socket.on('error', () => undefined)
  }

  it("starts a fresh drop's retries from the shortest wait again, rather than carrying on from how far a declined one had already climbed, and never fires the declined one's own retry once it stands idle", async () => {
    await withFolder(async (folder) => {
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        vi.mocked(runOn).mockResolvedValueOnce(goodRan)
        await hosts.connect(fakeHost.id)

        vi.mocked(runOn).mockResolvedValue(timeoutRan)
        hosts.noteFailure(fakeHost.id, { code: 255, err: 'Broken pipe', out: Buffer.alloc(0) })
        const afterDrop = vi.mocked(runOn).mock.calls.length
        // Its first retry, at 1 s, climbs the backoff so the next of this same run's own would be 2 s.
        await vi.waitFor(() => expect(vi.mocked(runOn).mock.calls.length).toBeGreaterThan(afterDrop), { timeout: 2_000, interval: 50 })
        const afterFirstRetry = vi.mocked(runOn).mock.calls.length

        // Declined right away, as a live run's own reconnect asking would be: the 2 s retry this run had already scheduled must never fire once it stands idle.
        const { env } = hosts.setup()
        ask(env['GECKIT_ASKPASS_SOCKET'] ?? '', { token: env['GECKIT_ASKPASS_TOKEN'] ?? '', host: fakeHost.id, prompt: "leo@devbox.local's password: ", conn: 'run-b' })
        await vi.waitFor(() => expect(hosts.prompts()).toHaveLength(1))
        hosts.answer({ id: hosts.prompts()[0]?.id ?? '' })
        await new Promise((done) => setTimeout(done, 20))
        expect(hosts.state(fakeHost.id)).toBe('idle')
        await new Promise((done) => setTimeout(done, 2_200))
        expect(vi.mocked(runOn).mock.calls.length).toBe(afterFirstRetry)

        // Reconnected by hand, up again, and dropped once more: its own first retry comes back at 1 s, not the 4 s the declined run had already climbed to.
        vi.mocked(runOn).mockResolvedValueOnce(goodRan)
        await hosts.connect(fakeHost.id)
        vi.mocked(runOn).mockResolvedValue(timeoutRan)
        hosts.noteFailure(fakeHost.id, { code: 255, err: 'Broken pipe', out: Buffer.alloc(0) })
        const afterSecondDrop = vi.mocked(runOn).mock.calls.length
        await vi.waitFor(() => expect(vi.mocked(runOn).mock.calls.length).toBeGreaterThan(afterSecondDrop), { timeout: 1_600, interval: 50 })
      } finally {
        hosts.dispose()
      }
    })
  }, 20_000)
})

describe('Not now on a card asked outside a check of its own', () => {
  /** Writes one line of the askpass helper's own protocol, as `hosts-cards.test.ts` does. */
  function ask(socketPath: string, message: Readonly<Record<string, unknown>>): void {
    const socket = connect(socketPath)
    socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`))
    socket.on('error', () => undefined)
  }

  const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

  it('leaves the host Not connected, whoever asked the card that was declined', async () => {
    await withFolder(async (folder) => {
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        const { env } = hosts.setup()
        const socketPath = env['GECKIT_ASKPASS_SOCKET'] ?? ''
        const token = env['GECKIT_ASKPASS_TOKEN'] ?? ''
        // Asked directly over the askpass socket, as a live run's own reconnect would, never through `connect`/`#check`.
        ask(socketPath, { token, host: fakeHost.id, prompt: "leo@devbox.local's password: ", conn: 'run-a' })
        await vi.waitFor(() => expect(hosts.prompts()).toHaveLength(1))
        expect(hosts.state(fakeHost.id)).toBe('needs')

        hosts.answer({ id: hosts.prompts()[0]?.id ?? '' })
        await tick()
        expect(hosts.state(fakeHost.id)).toBe('idle')
        expect(view(hosts.views())?.problem).toBeUndefined()
      } finally {
        hosts.dispose()
      }
    })
  })
})

describe('Trust the new key', () => {
  it("removes nothing and says why where the host's key has not in fact changed", async () => {
    await withFolder(async (folder) => {
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        vi.mocked(sshConfigTarget).mockClear()
        await expect(hosts.trustNewKey(fakeHost.id)).resolves.toEqual({ ok: false, problem: "devbox's key has not changed." })
        expect(sshConfigTarget).not.toHaveBeenCalled()
      } finally {
        hosts.dispose()
      }
    })
  })

  it('forgets the entry from the known_hosts file ssh -G itself names, asked for the same target sshArgs would connect with, and lets the host be reached again', async () => {
    await withFolder(async (folder) => {
      const known = join(folder, 'known_hosts')
      await writeFile(known, 'devbox.local ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIQtest\nother.local ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIQother\n')
      const hosts = new Hosts({
        folder,
        executable: process.execPath,
        hosts: () => [fakeHost],
        save: () => undefined,
        forgetProjects: () => undefined,
        remember: () => undefined,
        changed: () => undefined,
        prompt: () => undefined,
        answered: () => undefined,
        secrets: fakeSecrets,
      })
      try {
        vi.mocked(runOn).mockResolvedValue(changedKeyRan)
        await hosts.connect(fakeHost.id)
        expect(view(hosts.views())?.changedKey).toEqual({ print: 'SHA256:88eNewKey02d' })

        vi.mocked(sshConfigTarget).mockResolvedValue({ hostname: 'devbox.local', port: 22, knownHostsFiles: [known] })
        vi.mocked(runOn).mockResolvedValue(goodRan)
        const result = await hosts.trustNewKey(fakeHost.id)
        expect(result).toEqual({ ok: true })
        expect(view(hosts.views())?.changedKey).toBeUndefined()

        const left = await readFile(known, 'utf8')
        expect(left).not.toContain('devbox.local')
        expect(left).toContain('other.local')
      } finally {
        hosts.dispose()
      }
    })
  })
})

describe('addFolderSaying', () => {
  const hostsWith = (folder: string): Hosts =>
    new Hosts({
      folder,
      executable: process.execPath,
      hosts: () => [fakeHost],
      save: () => undefined,
      forgetProjects: () => undefined,
      remember: () => undefined,
      changed: () => undefined,
      prompt: () => undefined,
      answered: () => undefined,
      secrets: fakeSecrets,
    })

  it('says the host did not answer, and puts it out of reach to retry, where ssh itself never reached it - not where the path just is not a folder there', async () => {
    await withFolder(async (folder) => {
      const hosts = hostsWith(folder)
      try {
        vi.mocked(runOn).mockResolvedValueOnce(goodRan)
        await hosts.connect(fakeHost.id)
        vi.mocked(runOn).mockResolvedValue(timeoutRan)
        const before = vi.mocked(runOn).mock.calls.length
        await expect(hosts.addFolderSaying(fakeHost.id, '/work')).resolves.toEqual({
          problem: 'Could not add /work: devbox did not answer. Try again once it is connected.',
        })
        // Its own call, and the reconnect noteFailure set off once it read this as the host itself gone quiet.
        expect(vi.mocked(runOn).mock.calls.length).toBe(before + 2)
      } finally {
        hosts.dispose()
      }
    })
  })

  it('says the path is not a folder there where the script itself only failed - a `cd` into something that is not one, say - rather than folding that into "did not answer" too', async () => {
    await withFolder(async (folder) => {
      const hosts = hostsWith(folder)
      try {
        vi.mocked(runOn).mockResolvedValue({ code: 1, out: Buffer.alloc(0), err: '' })
        await expect(hosts.addFolderSaying(fakeHost.id, '/etc/hosts')).resolves.toEqual({ problem: '/etc/hosts is not a folder on devbox.' })
        expect(hosts.state(fakeHost.id)).toBe('idle')
      } finally {
        hosts.dispose()
      }
    })
  })
})
