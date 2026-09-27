import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Folders } from '../../shared/api'
import { draftProblem, hostIdFor, remoteRoot } from '../../shared/hosts'
import type { HostAnswer, HostCheck, HostConfig, HostDraft, HostPrompt, HostState, HostView, KnownHost } from '../../shared/hosts'
import { readPrompt, startAskpass } from './askpass'
import type { Asker } from './askpass'
import { readChecked, readFolders, readSshConfig } from './read'
import type { Checked } from './read'
import type { RemoteRun } from './run'
import { checkScript, foldersScript, installScript, resolveScript } from './run-script'
import type { Secrets } from './secrets'
import { controlFolder, runOn, sshArgs, sshProblem, sshProgram } from './ssh'
import type { SshSetup } from './ssh'

/**
 * Every host, how each stands, and everything asked of a person to reach one.
 *
 * A host's state is what the dot beside its name says. Two of them wait before
 * they are shown: Connecting for a second, since most connections take less
 * and a flash of it on every open reads as trouble; out of reach for ten,
 * since a network change or waking from sleep recovers in that time.
 */

/** Before Connecting is shown. */
export const SHOW_CONNECTING = 1_000
/** Before a host whose connection dropped is shown out of reach. */
export const SHOW_LOST = 10_000

export interface HostsDeps {
  /** `userData/hosts`, for the askpass helper and the connection sockets. */
  readonly folder: string
  /** GeckIt's own binary, which the askpass helper is run as Node with. */
  readonly executable: string
  readonly hosts: () => readonly HostConfig[]
  readonly save: (hosts: readonly HostConfig[]) => void
  /** Takes a removed host's projects off the list. */
  readonly forgetProjects: (host: string) => void
  readonly remember: (root: string) => void
  readonly changed: (views: readonly HostView[]) => void
  readonly prompt: (prompt: HostPrompt) => void
  /** A card was answered, here or on another screen, and goes. */
  readonly answered: (id: string) => void
  readonly checks?: (lines: readonly HostCheck[]) => void
  readonly secrets: Secrets
  readonly now?: () => number
}

interface Held {
  /** What it is. */
  state: HostState
  /** What it is shown as, which lags for Connecting and Lost. */
  shown: HostState
  since?: number
  problem?: string
  version?: string
  plan?: string
  timer?: NodeJS.Timeout
  checking: Promise<boolean> | undefined
  /** A remembered password was handed to ssh for the connection being made. */
  usedStored: boolean
  /** Not now was pressed on a card for the connection being made. */
  declined: boolean
  readonly runs: Map<RemoteRun, boolean>
}

interface Asked {
  readonly prompt: HostPrompt
  readonly done: (answer: string | undefined) => void
}

/** What `HostDisk` and the other routing need from `Hosts`, kept narrow so a test can hand it a fake. */
export interface HostsLike {
  config(id: string): HostConfig | undefined
  setup(): SshSetup
  state(id: string): HostState
}

export class Hosts implements HostsLike {
  readonly #deps: HostsDeps
  readonly #held = new Map<string, Held>()
  /** Hosts being added, not yet in Settings, reachable by id while their check runs. */
  readonly #drafts = new Map<string, HostConfig>()
  /** Passwords typed and not remembered, kept while GeckIt runs so each connection does not ask again. */
  readonly #typed = new Map<string, string>()
  readonly #asked = new Map<string, Asked>()
  readonly #asker: Asker
  readonly #control: string | undefined

  constructor(deps: HostsDeps) {
    this.#deps = deps
    this.#control = controlFolder(deps.folder)
    this.#asker = startAskpass(deps.folder, deps.executable, (host, prompt) => this.#ask(host, prompt))
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now()
  }

  config(id: string): HostConfig | undefined {
    return this.#deps.hosts().find((one) => one.id === id) ?? this.#drafts.get(id)
  }

  setup(): SshSetup {
    return { ...(this.#control === undefined ? {} : { control: this.#control }), env: this.#asker.env }
  }

  #hold(id: string): Held {
    let held = this.#held.get(id)
    if (held === undefined) {
      held = { state: 'idle', shown: 'idle', checking: undefined, usedStored: false, declined: false, runs: new Map() }
      this.#held.set(id, held)
    }
    return held
  }

  state(id: string): HostState {
    return this.#held.get(id)?.shown ?? 'idle'
  }

  views(): HostView[] {
    const canRemember = this.#deps.secrets.can()
    return this.#deps.hosts().map((host) => {
      const held = this.#held.get(host.id)
      const version = held?.version ?? host.seen?.version
      const plan = held?.plan ?? host.seen?.plan
      return {
        id: host.id,
        name: host.name,
        address: host.address,
        user: host.user,
        port: host.port,
        auth: host.auth,
        ...(host.keyFile === undefined ? {} : { keyFile: host.keyFile }),
        state: held?.shown ?? 'idle',
        ...(held?.since === undefined ? {} : { since: held.since }),
        ...(version === undefined ? {} : { version }),
        ...(plan === undefined ? {} : { plan }),
        ...(held?.problem === undefined ? {} : { problem: held.problem }),
        remembered: this.#deps.secrets.has(host.id),
        canRemember,
      }
    })
  }

  #tell(): void {
    this.#deps.changed(this.views())
  }

  /** Moves a host to a state, shown at once or after its wait. */
  #set(id: string, state: HostState, problem?: string): void {
    const held = this.#hold(id)
    const was = held.state
    held.state = state
    clearTimeout(held.timer)
    if (problem === undefined) delete held.problem
    else held.problem = problem
    if (state === 'up' && was !== 'up') held.since = this.#now()
    const wait = state === 'connecting' && held.shown !== 'lost' ? SHOW_CONNECTING : state === 'lost' ? SHOW_LOST : 0
    if (wait === 0) {
      held.shown = state
      this.#tell()
      return
    }
    held.timer = setTimeout(() => {
      if (held.state !== state) return
      held.shown = state
      this.#tell()
    }, wait)
  }

  /** Reaches the host and asks it about Claude Code, once at a time; true where a conversation can run there. */
  connect(id: string): Promise<boolean> {
    const held = this.#hold(id)
    if (held.state === 'up') return Promise.resolve(true)
    held.checking ??= this.#check(id).finally(() => {
      held.checking = undefined
    })
    return held.checking
  }

  /** Up already, or reached now. */
  ensure(id: string): Promise<boolean> {
    return this.connect(id)
  }

  async #check(id: string, again = false): Promise<boolean> {
    const host = this.config(id)
    if (host === undefined) return false
    const held = this.#hold(id)
    held.declined = false
    held.usedStored = false
    this.#set(id, 'connecting')
    const ran = await runOn(host, this.setup(), checkScript(), { timeout: 25_000 })
    if (ran.code !== 0) {
      // A remembered password the host no longer takes is forgotten, and the person asked for it once.
      if (!again && held.usedStored && /Permission denied/i.test(ran.err)) {
        this.#deps.secrets.forget(id)
        this.#typed.delete(id)
        return this.#check(id, true)
      }
      if (held.declined) this.#set(id, 'idle')
      else this.#set(id, 'needs', ran.code === null ? `Could not reach ${host.name}: timed out after 20 s.` : sshProblem(ran.err, host.name))
      return false
    }
    const checked = readChecked(ran.out.toString('utf8'))
    if (checked.missing) {
      this.#set(id, 'missing', `Claude Code is not installed on ${host.name}.`)
      return false
    }
    if (checked.version !== undefined) held.version = checked.version
    const plan = checked.account?.plan
    if (plan !== undefined) held.plan = plan
    this.#keepSeen(host, checked.version, plan)
    if (checked.account?.signedIn === false) {
      this.#set(id, 'signin', `Claude Code on ${host.name} is not signed in.`)
      return false
    }
    this.#set(id, 'up')
    for (const run of held.runs.keys()) run.now()
    return true
  }

  #keepSeen(host: HostConfig, version: string | undefined, plan: string | undefined): void {
    if (host.seen?.version === version && host.seen?.plan === plan) return
    const hosts = this.#deps.hosts()
    if (!hosts.some((one) => one.id === host.id)) return
    const seen = { ...(version === undefined ? {} : { version }), ...(plan === undefined ? {} : { plan }) }
    this.#deps.save(hosts.map((one) => (one.id === host.id ? { ...one, seen } : one)))
  }

  /** A run on the host, whose connection coming and going is the host's. */
  track(id: string, run: RemoteRun): (up: boolean) => void {
    const held = this.#hold(id)
    held.runs.set(run, true)
    run.once('close', () => {
      held.runs.delete(run)
    })
    return (up) => {
      held.runs.set(run, up)
      if (up && held.state !== 'up' && held.state !== 'connecting') this.#set(id, 'up')
      if (!up && held.state === 'up') this.#set(id, 'lost')
    }
  }

  /** Tries at once, for Reconnect. */
  reconnect(id: string): void {
    const held = this.#hold(id)
    if (held.state === 'lost') for (const run of held.runs.keys()) run.now()
    void this.connect(id)
  }

  /** Stops holding a connection; what works there keeps working. */
  disconnect(id: string): void {
    const host = this.config(id)
    const held = this.#hold(id)
    for (const run of held.runs.keys()) run.pause()
    this.#set(id, 'idle')
    if (host !== undefined && this.#control !== undefined) void runExit(host, this.setup())
  }

  remove(id: string): void {
    // Stopped there before its config goes: killed after, it would be reached
    // by its address rather than its host's, which is nobody.
    const runs = this.#held.get(id)?.runs.keys() ?? []
    for (const run of runs) run.kill()
    this.disconnect(id)
    this.#deps.secrets.forget(id)
    this.#typed.delete(id)
    this.#held.delete(id)
    this.#deps.save(this.#deps.hosts().filter((one) => one.id !== id))
    this.#deps.forgetProjects(id)
    this.#tell()
  }

  /** A stored password let go without removing the host: the next connection asks for it again. */
  forget(id: string): void {
    this.#deps.secrets.forget(id)
    this.#typed.delete(id)
    const hosts = this.#deps.hosts()
    if (hosts.some((one) => one.id === id && one.remember === true)) {
      this.#deps.save(hosts.map((one) => (one.id === id ? { ...one, remember: false } : one)))
    }
    this.#tell()
  }

  /** The hosts in the person's SSH config, for the sheet to offer. */
  known(): KnownHost[] {
    try {
      return readSshConfig(readFileSync(join(homedir(), '.ssh', 'config'), 'utf8'))
    } catch {
      return []
    }
  }

  /**
   * Reaches a host and tells the checks line by line, as Add a host and Edit a
   * host both show them. The last line is Claude Code's version and whether it
   * is signed in, or why it could not be reached at all.
   */
  async #probe(host: HostConfig, name: string): Promise<{ readonly ok: true; readonly checked: Checked } | { readonly ok: false; readonly problem: string }> {
    this.#deps.checks?.([{ text: `Reaching ${name}`, done: false }])
    const ran = await runOn(host, this.setup(), checkScript(), { timeout: 25_000 })
    if (ran.code !== 0) {
      const why = ran.code === null ? `Could not reach ${name}: timed out after 20 s.` : sshProblem(ran.err, name)
      this.#deps.checks?.([{ text: why, done: true, failed: true }])
      return { ok: false, problem: why }
    }
    const checked = readChecked(ran.out.toString('utf8'))
    const reached: HostCheck[] = [
      { text: `Reached ${name}`, done: true },
      checked.missing
        ? { text: `Claude Code is not installed on ${name}.`, done: true, failed: true }
        : { text: `Claude Code ${checked.version ?? ''}`.trim(), done: true },
      ...(checked.missing
        ? []
        : [
            checked.account?.signedIn === false
              ? { text: `Claude Code on ${name} is not signed in.`, done: true, failed: true }
              : { text: `Signed in${checked.account?.plan === undefined ? '' : `: Claude ${checked.account.plan}`}`, done: true },
          ]),
    ]
    this.#deps.checks?.(reached)
    return { ok: true, checked }
  }

  /** What a probe said, kept where the person is told about the host and held for the connection it started. */
  #settle(id: string, name: string, checked: Checked): HostView | undefined {
    const held = this.#hold(id)
    if (checked.version !== undefined) held.version = checked.version
    if (checked.account?.plan !== undefined) held.plan = checked.account.plan
    if (checked.missing) this.#set(id, 'missing', `Claude Code is not installed on ${name}.`)
    else if (checked.account?.signedIn === false) this.#set(id, 'signin', `Claude Code on ${name} is not signed in.`)
    else this.#set(id, 'up')
    return this.views().find((one) => one.id === id)
  }

  /**
   * Adds a host once it has been reached: the checks are told line by line as
   * they pass, and the host is kept only once the first one has.
   */
  async check(draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> {
    const problem = draftProblem(draft)
    if (problem !== undefined) return { ok: false, problem }
    const name = draft.name.trim() === '' ? draft.address.trim() : draft.name.trim()
    const id = hostIdFor(name, [...this.#deps.hosts().map((one) => one.id), ...this.#drafts.keys()])
    const host: HostConfig = {
      id,
      name,
      address: draft.address.trim(),
      user: draft.user.trim(),
      port: draft.port,
      auth: draft.auth,
      ...(draft.auth === 'key' && draft.keyFile !== undefined && draft.keyFile !== '' ? { keyFile: draft.keyFile } : {}),
      ...(draft.auth === 'password' && draft.remember === true ? { remember: true } : {}),
    }
    this.#drafts.set(id, host)
    if (draft.auth === 'password' && draft.password !== undefined && draft.password !== '') this.#typed.set(id, draft.password)
    const probed = await this.#probe(host, name)
    if (!probed.ok) {
      this.#drafts.delete(id)
      this.#typed.delete(id)
      return probed
    }
    const { checked } = probed
    const seen = {
      ...(checked.version === undefined ? {} : { version: checked.version }),
      ...(checked.account?.plan === undefined ? {} : { plan: checked.account.plan }),
    }
    this.#deps.save([...this.#deps.hosts(), { ...host, seen }])
    this.#drafts.delete(id)
    const typed = this.#typed.get(id)
    if (host.remember === true && typed !== undefined) this.#deps.secrets.set(id, typed)
    const view = this.#settle(id, name, checked)
    return view === undefined ? { ok: false, problem: `Could not keep ${name}.` } : { ok: true, host: view }
  }

  /**
   * Edits a host already kept. Only its name changed, and nothing about how it
   * is reached, is saved without a connection; anything else is checked again
   * the way Add a host checks it, and the old config stands where that fails,
   * so a project on it never moves under a root that no longer works.
   */
  async update(id: string, draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> {
    const existing = this.config(id)
    if (existing === undefined) return { ok: false, problem: 'That host is not here any more.' }
    const problem = draftProblem(draft)
    if (problem !== undefined) return { ok: false, problem }
    const name = draft.name.trim() === '' ? draft.address.trim() : draft.name.trim()
    const keyFile = draft.auth === 'key' && draft.keyFile !== undefined && draft.keyFile !== '' ? draft.keyFile : undefined
    const passwordTyped = draft.auth === 'password' && draft.password !== undefined && draft.password !== ''
    const sameConnection =
      existing.address === draft.address.trim() &&
      existing.user === draft.user.trim() &&
      existing.port === draft.port &&
      existing.auth === draft.auth &&
      (existing.keyFile ?? '') === (keyFile ?? '') &&
      !passwordTyped
    if (sameConnection) {
      if (existing.name !== name) {
        this.#deps.save(this.#deps.hosts().map((one) => (one.id === id ? { ...one, name } : one)))
        this.#tell()
      }
      const view = this.views().find((one) => one.id === id)
      return view === undefined ? { ok: false, problem: `Could not keep ${name}.` } : { ok: true, host: view }
    }
    // Remembered as it stood unless a fresh password says otherwise, or the auth moved off a password altogether.
    const remember = draft.auth !== 'password' ? false : passwordTyped ? draft.remember === true : existing.auth === 'password' && existing.remember === true
    const host: HostConfig = {
      id,
      name,
      address: draft.address.trim(),
      user: draft.user.trim(),
      port: draft.port,
      auth: draft.auth,
      ...(keyFile === undefined ? {} : { keyFile }),
      ...(remember ? { remember: true } : {}),
    }
    if (passwordTyped) this.#typed.set(id, draft.password as string)
    const probed = await this.#probe(host, name)
    if (!probed.ok) {
      if (passwordTyped) this.#typed.delete(id)
      return probed
    }
    const { checked } = probed
    const seen = {
      ...(checked.version === undefined ? {} : { version: checked.version }),
      ...(checked.account?.plan === undefined ? {} : { plan: checked.account.plan }),
    }
    this.#deps.save(this.#deps.hosts().map((one) => (one.id === id ? { ...host, seen } : one)))
    // Not remembered any more forgets what was; a fresh one typed and kept replaces it. Carried over as it was, it is left alone.
    if (!remember) this.#deps.secrets.forget(id)
    else if (passwordTyped) this.#deps.secrets.set(id, draft.password as string)
    const view = this.#settle(id, name, checked)
    return view === undefined ? { ok: false, problem: `Could not keep ${name}.` } : { ok: true, host: view }
  }

  /** One level of the host's folders, from its home where no path is given. */
  async folders(id: string, path: string | undefined): Promise<Folders | undefined> {
    const host = this.config(id)
    if (host === undefined) return undefined
    const ran = await runOn(host, this.setup(), foldersScript(path), { timeout: 30_000 })
    return ran.code === 0 ? readFolders(ran.out.toString('utf8')) : undefined
  }

  /** A folder on the host as a project, its links followed so the tool files it where it looks. */
  async addFolder(id: string, path: string): Promise<string | undefined> {
    const host = this.config(id)
    if (host === undefined) return undefined
    const ran = await runOn(host, this.setup(), resolveScript(path), { timeout: 30_000 })
    const resolved = ran.out.toString('utf8').trim().split('\n').pop() ?? ''
    if (ran.code !== 0 || !resolved.startsWith('/')) return undefined
    const root = remoteRoot(id, resolved)
    this.#deps.remember(root)
    // It was just reached, so it is shown as it stands rather than as not connected.
    void this.connect(id)
    return root
  }

  /** Runs the official installer on the host, then looks again. */
  async install(id: string): Promise<{ readonly ok: boolean; readonly text: string }> {
    const host = this.config(id)
    if (host === undefined) return { ok: false, text: 'That host is not here any more.' }
    const ran = await runOn(host, this.setup(), installScript(), { timeout: 10 * 60_000 })
    const text = `${ran.out.toString('utf8')}${ran.err}`.trim().split('\n').slice(-12).join('\n')
    const ok = ran.code === 0 && (await this.#check(id))
    return { ok, text }
  }

  /** What a terminal types to be on the host, in a folder, running something there. */
  terminalCommand(id: string, cwd: string | undefined, run: string | undefined): string | undefined {
    const host = this.config(id)
    if (host === undefined) return undefined
    const inner = [cwd === undefined ? '' : `cd ${shellWord(cwd)} && `, run === undefined ? 'exec "${SHELL:-/bin/sh}" -l' : `${run}`].join('')
    const args = sshArgs(host, {}, { tty: true, alone: true })
    return [sshProgram(), ...args.map(shellWord), shellWord(inner)].join(' ')
  }

  // --- what ssh asks ---------------------------------------------------------

  async #ask(id: string, prompt: string): Promise<string | undefined> {
    const host = this.config(id)
    if (host === undefined) return undefined
    const read = readPrompt(prompt, host.name, host.user)
    const held = this.#hold(id)
    if (read.kind === 'password') {
      const stored = this.#deps.secrets.get(id) ?? this.#typed.get(id)
      if (stored !== undefined && !held.usedStored) {
        held.usedStored = true
        return stored
      }
      held.usedStored = false
    }
    // The same question while one is up, from another connection being made at the same time, waits on that one.
    const same = [...this.#asked.values()].find((one) => one.prompt.host === id && one.prompt.kind === read.kind)
    if (same !== undefined) {
      return new Promise((done) => {
        const first = same.done
        this.#asked.set(same.prompt.id, {
          prompt: same.prompt,
          done: (answer) => {
            first(answer)
            done(answer)
          },
        })
      })
    }
    const asked: HostPrompt = { id: randomUUID(), host: id, ...read }
    this.#set(id, 'needs', read.text)
    return new Promise((done) => {
      this.#asked.set(asked.id, { prompt: asked, done })
      this.#deps.prompt(asked)
    })
  }

  /** What is being asked now, for a window that opened after it was. */
  prompts(): HostPrompt[] {
    return [...this.#asked.values()].map((one) => one.prompt)
  }

  answer(answer: HostAnswer): void {
    const asked = this.#asked.get(answer.id)
    if (asked === undefined) return
    this.#asked.delete(answer.id)
    this.#deps.answered(answer.id)
    const id = asked.prompt.host
    const held = this.#hold(id)
    if (answer.answer === undefined) {
      held.declined = true
      asked.done(undefined)
      return
    }
    if (asked.prompt.kind === 'password') {
      this.#typed.set(id, answer.answer)
      held.usedStored = true
      if (answer.remember === true) {
        this.#deps.secrets.set(id, answer.answer)
        this.#deps.save(this.#deps.hosts().map((one) => (one.id === id ? { ...one, remember: true } : one)))
      }
    }
    this.#set(id, 'connecting')
    asked.done(asked.prompt.kind === 'trust' ? 'yes' : answer.answer)
  }

  dispose(): void {
    for (const held of this.#held.values()) clearTimeout(held.timer)
    for (const asked of this.#asked.values()) asked.done(undefined)
    this.#asked.clear()
    this.#asker.close()
  }
}

/** A word for the local terminal's shell, quoted the way sh quotes. */
const shellWord = (word: string): string => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)

/** Closes the shared connection to a host, so Disconnect lets go of it at once. */
function runExit(host: HostConfig, setup: SshSetup): Promise<void> {
  const args = sshArgs(host, setup)
  const at = args.lastIndexOf(host.address)
  return new Promise((done) => {
    execFile(sshProgram(), [...args.slice(0, at), '-O', 'exit', host.address], { env: { ...process.env, ...setup.env }, timeout: 5_000 }, () => done())
  })
}
