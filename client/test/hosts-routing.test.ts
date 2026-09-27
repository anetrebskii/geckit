import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hostResumeLine, hostUpload } from '../src/main/hosts/route'
import type { Routes } from '../src/main/hosts/route'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { SessionsDeps } from '../src/main/sessions'
import type { Driver, Heard } from '../src/main/sessions/heard'
import * as tasks from '../src/main/sessions/tasks'
import type { ClaudeModel } from '../src/shared/api'
import type { HostConfig, HostState } from '../src/shared/hosts'

// This computer's own reader of what a task in the background printed, spied on rather than run: a conversation on a
// host that answers nothing for a task is not a reason to go looking for it in a folder that is not this root's own.
vi.mock('../src/main/sessions/tasks', () => ({
  taskFile: vi.fn(async () => 'nowhere'),
  taskOutput: vi.fn(async () => undefined),
}))

/**
 * Routing a project's root to its host, or leaving it to this computer,
 * without a real connection anywhere: what changes here is read for a project
 * started in a folder below one already listed, whether a card names a file
 * against the host's own path rather than `ssh://…`, what a message may ask of
 * the plan on a conversation that runs on a host rather than this computer's
 * own claude, and the small scripts route.ts builds before it ever reaches ssh.
 */

const fakeHost: HostConfig = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' }

/** A `Routes` standing in for the real one: only what each function under test reads from `hosts` is given. */
function fakeRoutes(state: HostState, terminalCommand?: (id: string, cwd: string | undefined, run: string | undefined) => string | undefined): Routes {
  return {
    hosts: {
      config: (id: string) => (id === fakeHost.id ? fakeHost : undefined),
      setup: () => ({ env: {} }),
      state: () => state,
      terminalCommand: terminalCommand ?? (() => undefined),
    },
  } as unknown as Routes
}

describe('a terminal that resumes a conversation on a host', () => {
  it('asks the host for the line, with `claude --resume` and the conversation folder', () => {
    const asked: [string, string | undefined, string | undefined][] = []
    const routes = fakeRoutes('up', (id, cwd, run) => {
      asked.push([id, cwd, run])
      return `ssh devbox '${run ?? ''}'`
    })
    expect(hostResumeLine(routes, 'ssh://devbox/home/leo/trailmap', 'abc-123')).toBe(`ssh devbox 'claude --resume abc-123'`)
    expect(asked).toEqual([['devbox', '/home/leo/trailmap', 'claude --resume abc-123']])
  })

  it('is nothing for a local root, which asks no host at all', () => {
    const routes = fakeRoutes('up', () => 'should not be called')
    expect(hostResumeLine(routes, '/Users/leo/trailmap', 'abc-123')).toBeUndefined()
  })
})

describe('a file carried to a host', () => {
  let folder = ''
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'geckit-upload-'))
  })
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('is handed back unchanged for a local root, nothing read or reached', async () => {
    const routes = fakeRoutes('idle')
    expect(await hostUpload(routes, '/Users/leo/trailmap', join(folder, 'shot.png'))).toBe(join(folder, 'shot.png'))
  })

  it('is nothing where the host is not up, without a connection attempted', async () => {
    const path = join(folder, 'shot.png')
    await writeFile(path, 'x')
    const routes = fakeRoutes('lost')
    expect(await hostUpload(routes, 'ssh://devbox/home/leo/trailmap', path)).toBeUndefined()
  })

  it('is nothing for a file that is not there, even where the host is up', async () => {
    const routes = fakeRoutes('up')
    expect(await hostUpload(routes, 'ssh://devbox/home/leo/trailmap', join(folder, 'missing.png'))).toBeUndefined()
  })
})

describe('a project root that names a host, listed', () => {
  const ROOT = 'ssh://devbox/home/leo/trailmap'

  function build(found: readonly (Partial<{ readonly below: string }> & { readonly id: string; readonly root?: string })[]): Sessions {
    const rows: (readonly unknown[])[] = []
    return new Sessions({
      notes: memoryNotes(),
      changed: (all) => rows.push(all),
      items: () => undefined,
      account: () => undefined,
      notify: () => undefined,
      disk: {
        list: async () =>
          found.map(({ id, below }) => ({
            id,
            title: id,
            stands: '',
            at: 1,
            driven: false,
            ...(below === undefined ? {} : { below }),
          })),
        read: async () => undefined,
        has: async () => false,
      },
      claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }),
      claudeModels: async (): Promise<ClaudeModel[] | undefined> => undefined,
      claudeProgram: async () => undefined,
      usage: async () => ({ windows: new Map() }),
    } satisfies SessionsDeps)
  }

  it("turns a raw host path below the project into an `ssh://` root of its own, not the bare path a host's listing gives back", async () => {
    const sessions = build([{ id: 'below-one', below: '/home/leo/trailmap/sub' }])
    const listed = await sessions.list([ROOT])
    expect(listed.find((one) => one.id === 'below-one')).toMatchObject({ root: 'ssh://devbox/home/leo/trailmap/sub', project: ROOT })
  })

  it('leaves a row with no `below` at the project root itself', async () => {
    const sessions = build([{ id: 'at-root' }])
    const listed = await sessions.list([ROOT])
    expect(listed.find((one) => one.id === 'at-root')).toMatchObject({ root: ROOT })
    expect(listed.find((one) => one.id === 'at-root')?.project).toBeUndefined()
  })
})

describe('a conversation that runs on a host', () => {
  const ROOT = 'ssh://devbox/home/leo/trailmap'

  function build(over: Partial<SessionsDeps> = {}): { sessions: Sessions; hear: (said: Partial<Heard>) => void; made: number } {
    let made = 0
    let heard: ((heard: Heard) => void) | undefined
    const driver: Driver = {
      send: () => undefined,
      answer: () => undefined,
      permit: () => undefined,
      control: async () => ({}),
      stop: () => undefined,
      end: () => Promise.resolve(),
    }
    const sessions = new Sessions({
      notes: memoryNotes(),
      changed: () => undefined,
      items: () => undefined,
      account: () => undefined,
      notify: () => undefined,
      disk: { list: async () => [], read: async () => undefined, has: async () => false },
      claude: (_options, hear) => {
        made += 1
        heard = hear
        return driver
      },
      // This computer is signed in with a key: nothing runs here at all, but a host reached over ssh has its own account, which this says nothing about.
      claudeAccount: async () => ({ here: true, signedIn: true, key: true }),
      claudeModels: async () => undefined,
      claudeProgram: async () => undefined,
      usage: async () => ({ windows: new Map() }),
      taskOutput: async () => undefined,
      ...over,
    })
    return {
      sessions,
      hear: (said) => heard?.({ items: [], gone: [], signals: [], ...said }),
      get made() {
        return made
      },
    }
  }

  it("starts the host's own claude for a message, rather than folding it as off-plan on this computer's key", async () => {
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'do the thing' })
    expect(built.made).toBe(1)
    expect((await built.sessions.items(id)).some((item) => item.kind === 'note' && item.note === 'failed')).toBe(false)
  })

  it("does not read this computer's own task files once a host that could not be reached answers nothing for one", async () => {
    vi.mocked(tasks.taskOutput).mockClear()
    const built = build()
    const id = await built.sessions.send({ root: ROOT, mode: 'manual', text: 'do the thing' })
    const task = { id: 'b1', kind: 'local_bash', what: 'npm run dev', status: 'running', started: 1 } as const
    built.hear({ signals: [{ kind: 'task', task }] })
    expect(await built.sessions.taskOutput(id, 'b1')).toBeUndefined()
    expect(tasks.taskOutput).not.toHaveBeenCalled()
  })
})
