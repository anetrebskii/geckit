import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Folders } from '../../shared/api'
import { draftProblem, hostIdFor, remoteRoot } from '../../shared/hosts'
import type { HostAnswer, HostCheck, HostConfig, HostDraft, HostPrompt, HostState, HostView, KnownHost } from '../../shared/hosts'
import { setAsking } from './asking'
import { readPrompt, startAskpass } from './askpass'
import type { Asker } from './askpass'
import { readChecked, readFolders, readSshConfig } from './read'
import type { Checked } from './read'
import { retryAfter } from './run'
import type { RemoteRun } from './run'
import { checkScript, foldersScript, installScript, resolveScript } from './run-script'
import type { Secrets } from './secrets'
import {
  badArgsProblem,
  changedKeyPrint,
  changedKeyProblem,
  controlFolder,
  isChangedKeyProblem,
  isConnectionFailure,
  knownHostsTargets,
  removeWithLines,
  runOn,
  sshArgs,
  sshConfigTarget,
  sshKeygenProgram,
  sshProblem,
  sshProgram,
} from './ssh'
import type { Ran, SshSetup } from './ssh'

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
  /** A host's own forwarded ports, let go of because it is no longer the same computer underneath. */
  readonly forwardsChanged?: (host: string) => void
  /** The mirror and listing kept of a host's conversations, thrown away because it no longer names the same computer. */
  readonly diskForget?: (host: string) => void
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
  who?: string
  timer?: NodeJS.Timeout
  checking: Promise<boolean> | undefined
  /** The connections a remembered password was already handed to: asked twice by the same one, it was wrong. */
  usedStored: Set<string>
  /** Not now was pressed on a card for the connection being made. */
  declined: boolean
  readonly runs: Map<RemoteRun, boolean>
  /** A blip's own retry, separate from a live run's: cleared once it comes up, the person acts, or a card is up for it. */
  retry?: NodeJS.Timeout
  retries: number
  /** Ever reached 'up' since GeckIt started: a connection failure before this ever happened is told outright rather than retried in silence. */
  everUp: boolean
  /** When it first went `lost`, so a retry meanwhile never resets the 10 s before Lost is shown, nor the moment it is. Gone once it is `up` again or the person acts. */
  lostAt?: number
  /** The host's key changed since it was last reached, until the person trusts the new one or the check moves on to something else. */
  changedKey?: {
    readonly print?: string
    /** The exact `ssh-keygen -f <file> -R <target>` ssh itself printed for this, where it said one: the more exact of the two ways Trust the new key has of finding what to forget. */
    readonly removeWith?: readonly { readonly file: string; readonly target: string }[]
  }
}

interface Asked {
  readonly prompt: HostPrompt
  /** Every connection waiting on the same question at once; each is answered together, and each can also be dropped on its own. */
  readonly dones: Set<(answer: string | undefined) => void>
  /** Whether the host stood 'up' the moment this was asked, so answering it can put it back rather than leave it 'connecting' with nothing left to move it on. */
  readonly wasUp: boolean
}

/** What `HostDisk` and the other routing need from `Hosts`, kept narrow so a test can hand it a fake. */
export interface HostsLike {
  config(id: string): HostConfig | undefined
  setup(): SshSetup
  state(id: string): HostState
  /** A command's own connection to an 'up' host failed rather than the command on it: the host goes `lost` and is tried again. */
  noteFailure?(id: string, ran: Ran): void
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
    this.#asker = startAskpass(deps.folder, deps.executable, (host, prompt, conn, abandoned) => this.#ask(host, prompt, conn, abandoned))
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
      held = { state: 'idle', shown: 'idle', checking: undefined, usedStored: new Set(), declined: false, runs: new Map(), retries: 0, everUp: false }
      this.#held.set(id, held)
    }
    return held
  }

  state(id: string): HostState {
    return this.#held.get(id)?.shown ?? 'idle'
  }

  /** A command's own connection to a host thought `up` failed: it is out of reach for now rather than the command having gone wrong, so it goes `lost` and is tried again. */
  noteFailure(id: string, ran: Ran): void {
    if (!isConnectionFailure(ran.code, ran.err)) return
    const held = this.#held.get(id)
    if (held === undefined || held.state !== 'up') return
    this.#set(id, 'lost')
    this.reconnect(id)
  }

  views(): HostView[] {
    const canRemember = this.#deps.secrets.can()
    return this.#deps.hosts().map((host) => {
      const held = this.#held.get(host.id)
      const version = held?.version ?? host.seen?.version
      const plan = held?.plan ?? host.seen?.plan
      const who = held?.who ?? host.seen?.who
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
        ...(who === undefined ? {} : { who }),
        ...(held?.problem === undefined ? {} : { problem: held.problem }),
        ...(held?.changedKey === undefined ? {} : { changedKey: held.changedKey }),
        remembered: this.#deps.secrets.has(host.id),
        canRemember,
      }
    })
  }

  #tell(): void {
    this.#deps.changed(this.views())
  }

  /**
   * Moves a host to a state, shown at once or after its wait.
   *
   * A retry made while a drop is still within its 10 s grace, or already
   * shown Lost, never itself changes what is shown: `lostAt`, set once at the
   * first drop and gone only once it is `up` again or the person acts, is
   * what the 10 s is counted from and what a `connecting` in between defers
   * to, so retries never flicker between Connecting and Lost.
   */
  #set(id: string, state: HostState, problem?: string): void {
    const held = this.#hold(id)
    const was = held.state
    held.state = state
    // A retry's own `connecting` while a drop already stands as Lost (or is still within its grace) says nothing new about why: the reason kept for it is left alone rather than cleared and then only sometimes put back once the retry itself fails.
    const keepProblem = state === 'connecting' && held.lostAt !== undefined
    if (!keepProblem) {
      if (problem === undefined) delete held.problem
      else held.problem = problem
    }
    if (state === 'up') {
      if (was !== 'up') held.since = this.#now()
      held.everUp = true
      clearTimeout(held.timer)
      delete held.lostAt
      held.shown = 'up'
      this.#tell()
      return
    }
    if (state === 'lost') {
      if (held.lostAt === undefined) {
        held.lostAt = this.#now()
        clearTimeout(held.timer)
        held.timer = setTimeout(() => {
          if (held.lostAt === undefined) return
          held.shown = 'lost'
          this.#tell()
        }, SHOW_LOST)
      }
      this.#tell()
      return
    }
    if (state === 'connecting') {
      // Already counting down to Lost, or already shown it: left exactly as it is until the check succeeds or the grace runs out.
      if (held.lostAt !== undefined || held.shown === 'lost') {
        this.#tell()
        return
      }
      clearTimeout(held.timer)
      held.timer = setTimeout(() => {
        if (held.state !== 'connecting') return
        held.shown = 'connecting'
        this.#tell()
      }, SHOW_CONNECTING)
      this.#tell()
      return
    }
    clearTimeout(held.timer)
    delete held.lostAt
    held.shown = state
    this.#tell()
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
    delete held.changedKey
    clearTimeout(held.retry)
    this.#set(id, 'connecting')
    let conn: string | undefined
    const ran = await runOn(host, this.setup(), checkScript(), { timeout: 25_000, onConnection: (own) => (conn = own) })
    if (ran.code !== 0) {
      // A remembered password the host no longer takes is forgotten, and the person asked for it once.
      if (!again && conn !== undefined && held.usedStored.has(conn) && /Permission denied/i.test(ran.err)) {
        this.#deps.secrets.forget(id)
        this.#typed.delete(id)
        return this.#check(id, true)
      }
      if (held.declined) {
        // `answer` itself already reset the retries the moment Not now was pressed: this only settles the state, on whatever this run's own failure turned out to be once it caught up with that.
        this.#set(id, 'idle')
      } else if (isChangedKeyProblem(ran.err)) {
        const print = changedKeyPrint(ran.err)
        const removeWith = removeWithLines(ran.err)
        held.changedKey = { ...(print === undefined ? {} : { print }), ...(removeWith.length === 0 ? {} : { removeWith }) }
        this.#set(id, 'needs', changedKeyProblem(host.name))
      } else if (isConnectionFailure(ran.code, ran.err) && held.everUp) {
        // A blip rather than a real problem, on a host that has answered before: tried again with the same backoff a live run's own reconnect uses, until it comes up, the person acts, or a card is up. Told outright once 5 retries in a row have failed, so it is not Lost forever with no reason.
        this.#set(id, 'lost', held.retries >= 5 ? sshProblem(ran.err, host.name, host.user) : undefined)
        this.#retryCheck(id)
      } else if (isConnectionFailure(ran.code, ran.err)) {
        // Never reached this run: said outright rather than retried in silence, so the person is not left watching a hollow dot that never explains itself.
        this.#set(id, 'needs', sshProblem(ran.err, host.name, host.user))
      } else {
        this.#set(
          id,
          'needs',
          badArgsProblem(ran.err, host.name) ?? (ran.timedOut === true ? `Could not reach ${host.name}: timed out after 20 s.` : ran.code === null ? `The connection to ${host.name} was closed.` : sshProblem(ran.err, host.name, host.user)),
        )
      }
      return false
    }
    held.retries = 0
    const checked = readChecked(ran.out.toString('utf8'))
    this.#keepSeen(host, checked)
    if (checked.missing) {
      this.#set(id, 'missing', `Claude Code is not installed on ${host.name}.`)
      return false
    }
    if (checked.version !== undefined) held.version = checked.version
    const plan = checked.account?.plan
    if (plan !== undefined) held.plan = plan
    const who = checked.account?.who
    if (who !== undefined) held.who = who
    if (checked.account?.signedIn === false) {
      this.#set(id, 'signin', `Claude Code on ${host.name} is not signed in.`)
      return false
    }
    this.#set(id, 'up')
    for (const run of held.runs.keys()) run.now()
    return true
  }

  /** Tries `#check` again after a blip (see `#check`'s own `isConnectionFailure` branch), stopping once it comes up, the person disconnects or removes the host, or a card is up for it. */
  #retryCheck(id: string): void {
    const held = this.#hold(id)
    clearTimeout(held.retry)
    const wait = retryAfter(held.retries)
    held.retries += 1
    held.retry = setTimeout(() => {
      const now = this.#held.get(id)
      if (now === undefined || now.state !== 'lost' || this.config(id) === undefined) return
      if ([...this.#asked.values()].some((one) => one.prompt.host === id)) return
      void this.connect(id)
    }, wait)
  }

  #keepSeen(host: HostConfig, checked: Checked): void {
    const seen = { ...host.seen, ...seenOf(checked) }
    if (host.seen?.version === seen.version && host.seen?.plan === seen.plan && host.seen?.who === seen.who) return
    const hosts = this.#deps.hosts()
    if (!hosts.some((one) => one.id === host.id)) return
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
      // A run attaching at all says the host is reachable, whatever it was shown as a moment ago.
      if (up && held.state !== 'up') this.#set(id, 'up')
      if (!up && held.state === 'up') this.#set(id, 'lost')
    }
  }

  /** How many runs Remove would stop on the host now, idle ones too, since Remove kills every one of them whatever it is doing. Disconnect asks `Sessions` instead for how many are actually working or waiting on an answer, which is what it means by "working there". */
  running(id: string): number {
    return this.#held.get(id)?.runs.size ?? 0
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
    clearTimeout(held.retry)
    held.retries = 0
    for (const run of held.runs.keys()) run.pause()
    this.#set(id, 'idle')
    if (host !== undefined && this.#control !== undefined) void runExit(host, this.setup())
  }

  /** Every card up for a host, answered as Not now, so nothing is left waiting on a host that has just gone. */
  #dropCards(id: string): void {
    for (const [askId, asked] of [...this.#asked.entries()]) {
      if (asked.prompt.host !== id) continue
      this.#asked.delete(askId)
      this.#deps.answered(askId)
      for (const done of asked.dones) done(undefined)
    }
  }

  async remove(id: string): Promise<void> {
    // Stopped there before its config goes: killed after, it would be reached
    // by its address rather than its host's, which is nobody. Its own stop
    // script is given a moment to finish over the shared connection before
    // that connection is closed out from under it.
    const runs = [...(this.#held.get(id)?.runs.keys() ?? [])]
    for (const run of runs) run.kill()
    await Promise.race([Promise.allSettled(runs.map((run) => run.stopped())), wait(5_000)])
    this.disconnect(id)
    this.#dropCards(id)
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
    this.#held.get(id)?.usedStored.clear()
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
   * The person trusts a host's changed key: its old entry is forgotten from
   * wherever ssh itself would look for it, so the next connection sees it as
   * unknown rather than changed, and is reached again at once. Nothing is
   * removed, and a reason is given instead, where the host does not currently
   * have a changed key to trust.
   */
  async trustNewKey(id: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: string }> {
    const host = this.config(id)
    if (host === undefined) return { ok: false, problem: 'That host is not here any more.' }
    const held = this.#hold(id)
    const changedKey = held.changedKey
    if (changedKey === undefined) return { ok: false, problem: `${host.name}'s key has not changed.` }
    const entries = changedKey.removeWith !== undefined && changedKey.removeWith.length > 0 ? changedKey.removeWith : await this.#guessRemoval(host)
    if (entries.length === 0) return { ok: false, problem: `Could not tell where ${host.name}'s old key is kept. Remove it yourself with ssh-keygen -R, then try again.` }
    const removed = await Promise.all(entries.map((one) => forgetKnownHost(one.file, one.target)))
    if (!removed.every((one) => one)) return { ok: false, problem: `Could not forget ${host.name}'s old key. Remove it yourself with ssh-keygen -R, then try again.` }
    delete held.changedKey
    void this.connect(id)
    return { ok: true }
  }

  /**
   * Where a changed key is forgotten from when ssh did not print its own
   * "remove with:" line: asked of ssh itself, with `ssh -G`, which reads an
   * alias, a `HostKeyAlias`, a config port and every `UserKnownHostsFile` the
   * way ssh reads them rather than guessed from the address and port alone;
   * `knownHostsTargets` and ssh's own default file stand in only where even
   * that could not be asked.
   */
  async #guessRemoval(host: HostConfig): Promise<{ readonly file: string; readonly target: string }[]> {
    const resolved = await sshConfigTarget(host, this.setup())
    const fallbackFile = join(homedir(), '.ssh', 'known_hosts')
    if (resolved === undefined) return knownHostsTargets(host).map((target) => ({ file: fallbackFile, target }))
    const names = resolved.hostKeyAlias !== undefined ? [resolved.hostKeyAlias] : [resolved.hostname === '' ? host.address : resolved.hostname]
    const targets = resolved.port === 22 ? names : [...names, ...names.map((name) => `[${name}]:${String(resolved.port)}`)]
    const files = resolved.knownHostsFiles.length > 0 ? resolved.knownHostsFiles : [fallbackFile]
    return files.flatMap((file) => targets.map((target) => ({ file, target })))
  }

  /**
   * Reaches a host and tells the checks line by line, as Add a host and Edit a
   * host both show them. The last line is Claude Code's version and whether it
   * is signed in, or why it could not be reached at all.
   */
  async #probe(
    host: HostConfig,
    name: string,
    options: { readonly alone?: boolean } = {},
  ): Promise<{ readonly ok: true; readonly checked: Checked } | { readonly ok: false; readonly problem: string }> {
    this.#deps.checks?.([{ text: `Reaching ${name}`, done: false }])
    const ran = await runOn(host, this.setup(), checkScript(), { timeout: 25_000, ...(options.alone === undefined ? {} : { alone: options.alone }) })
    if (ran.code !== 0) {
      const why = badArgsProblem(ran.err, name) ?? (ran.timedOut === true ? `Could not reach ${name}: timed out after 20 s.` : ran.code === null ? `The connection to ${name} was closed.` : sshProblem(ran.err, name, host.user))
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
    if (checked.account?.who !== undefined) held.who = checked.account.who
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
    const seen = seenOf(checked)
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
    // Alone, not over the old master: reusing it would silently ride on credentials that may no longer be the ones just typed, so it would never truly test them.
    const probed = await this.#probe(host, name, { alone: true })
    if (!probed.ok) {
      if (passwordTyped) this.#typed.delete(id)
      return probed
    }
    const { checked } = probed
    const seen = seenOf(checked)
    this.#deps.save(this.#deps.hosts().map((one) => (one.id === id ? { ...host, seen } : one)))
    // Not remembered any more forgets what was; a fresh one typed and kept replaces it. Carried over as it was, it is left alone.
    if (!remember) this.#deps.secrets.forget(id)
    else if (passwordTyped) this.#deps.secrets.set(id, draft.password as string)
    // How it is reached moved out from under the old shared connection and its forwards: closed rather than left to mix an old machine's bytes with a new one's.
    if (this.#control !== undefined) void runExit(existing, this.setup())
    this.#deps.forwardsChanged?.(id)
    this.#held.get(id)?.usedStored.clear()
    for (const run of this.#held.get(id)?.runs.keys() ?? []) run.reconnect()
    if (existing.address !== host.address) this.#deps.diskForget?.(id)
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

  /** `addFolder`, but with why it failed rather than only that it did: not reached at all, or the path is not a folder there. */
  async addFolderSaying(id: string, path: string): Promise<{ readonly root: string } | { readonly problem: string }> {
    const host = this.config(id)
    if (host === undefined) return { problem: 'That host is not here any more.' }
    const ran = await runOn(host, this.setup(), resolveScript(path), { timeout: 30_000 })
    if (isConnectionFailure(ran.code, ran.err)) {
      this.noteFailure(id, ran)
      return { problem: `Could not add ${path}: ${host.name} did not answer. Try again once it is connected.` }
    }
    const resolved = ran.out.toString('utf8').trim().split('\n').pop() ?? ''
    if (ran.code !== 0 || !resolved.startsWith('/')) return { problem: `${path} is not a folder on ${host.name}.` }
    const root = remoteRoot(id, resolved)
    this.#deps.remember(root)
    // It was just reached, so it is shown as it stands rather than as not connected.
    void this.connect(id)
    return { root }
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

  /**
   * `abandoned` is told, once, if the ssh that asked this is gone before it is
   * answered - killed by its own command's timeout, say - so a card is never
   * left up nor a state moved for a connection nobody is waiting on any more.
   *
   * `conn` names the very ssh process asking, not the host: while it waits it
   * is marked so its own command is given more time rather than killed under
   * it (see `ssh.ts`'s `runOn`), and that mark comes off however its own wait
   * ends, whether it asked the card itself or only joined one already up.
   */
  async #ask(id: string, prompt: string, conn: string, abandoned: (fn: () => void) => void): Promise<string | undefined> {
    const host = this.config(id)
    if (host === undefined) return undefined
    const read = readPrompt(prompt, host.name, host.user)
    const held = this.#hold(id)
    if (read.kind === 'password') {
      const stored = this.#deps.secrets.get(id) ?? this.#typed.get(id)
      if (stored !== undefined && !held.usedStored.has(conn)) {
        held.usedStored.add(conn)
        if (held.usedStored.size > 50) held.usedStored.clear()
        return stored
      }
    }
    setAsking(conn, true)
    const settled =
      (resolve: (answer: string | undefined) => void) =>
      (answer: string | undefined): void => {
        setAsking(conn, false)
        resolve(answer)
      }
    // The same question while one is up, from another connection being made at the same time, waits on that one.
    const same = [...this.#asked.values()].find((one) => one.prompt.host === id && one.prompt.kind === read.kind)
    if (same !== undefined) {
      return new Promise((resolve) => {
        const done = settled(resolve)
        same.dones.add(done)
        abandoned(() => {
          same.dones.delete(done)
          done(undefined)
          this.#dropIfOrphaned(same.prompt.id, same)
        })
      })
    }
    const asked: HostPrompt = { id: randomUUID(), host: id, ...read }
    const entry: Asked = { prompt: asked, dones: new Set(), wasUp: held.state === 'up' }
    this.#asked.set(asked.id, entry)
    this.#set(id, 'needs', read.text)
    return new Promise((resolve) => {
      const done = settled(resolve)
      entry.dones.add(done)
      this.#deps.prompt(asked)
      abandoned(() => {
        entry.dones.delete(done)
        done(undefined)
        this.#dropIfOrphaned(asked.id, entry)
      })
    })
  }

  /**
   * Nobody is left waiting on a card: it goes, whether the last to let go is
   * the connection that asked it or only one that joined the same question,
   * and where it left the host stands since nothing was answered.
   */
  #dropIfOrphaned(askId: string, entry: Asked): void {
    if (entry.dones.size > 0 || this.#asked.get(askId) !== entry) return
    this.#asked.delete(askId)
    this.#deps.answered(askId)
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
      // Not now leaves nothing behind for the next drop to trip over: a retry already waiting for this one is dropped too, and the backoff starts from its shortest wait again rather than carrying on from how long this attempt had already been failing.
      clearTimeout(held.retry)
      held.retries = 0
      // Not now always leaves the host Not connected with nothing to say, whether this card came from `#check`'s own connection or from a live run reconnecting on its own: nobody is left waiting on an answer that is never coming.
      this.#set(id, 'idle')
      for (const done of asked.dones) done(undefined)
      return
    }
    if (asked.prompt.kind === 'password') {
      this.#typed.set(id, answer.answer)
      if (answer.remember === true) {
        this.#deps.secrets.set(id, answer.answer)
        this.#deps.save(this.#deps.hosts().map((one) => (one.id === id ? { ...one, remember: true } : one)))
      }
    }
    if (asked.dones.size > 0) {
      // A check already running settles the state itself once it finishes; otherwise this was the host's own connection, so it stands as it did (up) rather than hang at 'connecting' with nothing left to move it on.
      this.#set(id, held.checking !== undefined ? 'connecting' : asked.wasUp ? 'up' : 'connecting')
    }
    for (const done of asked.dones) done(asked.prompt.kind === 'trust' ? 'yes' : answer.answer)
  }

  dispose(): void {
    for (const held of this.#held.values()) {
      clearTimeout(held.timer)
      clearTimeout(held.retry)
    }
    for (const asked of this.#asked.values()) for (const done of asked.dones) done(undefined)
    this.#asked.clear()
    this.#asker.close()
  }
}

/** A short wait with nothing riding on it finishing, so an await never blocks past a sane bound. */
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What a check says about a host that is worth keeping for when it is not connected. */
const seenOf = (checked: Checked): NonNullable<HostConfig['seen']> => ({
  ...(checked.version === undefined ? {} : { version: checked.version }),
  ...(checked.account?.plan === undefined ? {} : { plan: checked.account.plan }),
  ...(checked.account?.who === undefined ? {} : { who: checked.account.who }),
})

/** A word for the local terminal's shell, quoted the way sh quotes. */
const shellWord = (word: string): string => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)

/** Closes the shared connection to a host, so Disconnect lets go of it at once. */
function runExit(host: HostConfig, setup: SshSetup): Promise<void> {
  const args = sshArgs(host, setup)
  // `sshArgs` ends its own options with `--` right before the address: the control command goes in ahead of that, not after it, so it is read as ssh's own option rather than as more of the destination.
  const at = args.lastIndexOf('--')
  const before = at < 0 ? args.slice(0, args.lastIndexOf(host.address)) : args.slice(0, at)
  return new Promise((done) => {
    execFile(sshProgram(), [...before, '-O', 'exit', '--', host.address], { env: { ...process.env, ...setup.env }, timeout: 5_000 }, () => done())
  })
}

/**
 * Forgets one target from one `known_hosts` file, the way `ssh-keygen -R`
 * itself would from a terminal; true also where the file is not there, since
 * there is nothing in it to trust again either way, and asking ssh-keygen for
 * a file it cannot open would only be told the same in a longer way.
 */
function forgetKnownHost(file: string, target: string): Promise<boolean> {
  if (!existsSync(file)) return Promise.resolve(true)
  return new Promise((done) => {
    execFile(sshKeygenProgram(), ['-f', file, '-R', target], { timeout: 5_000 }, (error) => done(error === null))
  })
}
