import { randomUUID } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { BackgroundTask, ClaudeModel, FileShown, GitState, McpServer, TaskOutput, Uploaded } from '../../shared/api'
import { resumeCommand } from '../../shared/api'
import { hostOf, pathOf } from '../../shared/hosts'
import type { HostConfig } from '../../shared/hosts'
import { readGit, repoOf } from '../git'
import { holdClaude } from '../sessions/claude'
import type { ClaudeOptions } from '../sessions/claude'
import { folders as localFolders } from '../sessions/disk'
import type { Driver, Heard } from '../sessions/heard'
import { MCP_ARGS, readMcp } from '../sessions/mcp'
import type { McpChange } from '../sessions/mcp'
import { claudeModelsFrom } from '../sessions/models'
import { plain, runShell } from '../sessions/shell'
import { taskOutput } from '../sessions/tasks'
import { ASK_ONLY } from '../sessions/usage'
import type { Ran, Running } from '../sessions/shell'
import type { HostDisk } from './disk'
import type { Forwards } from './forward'
import type { Hosts } from './hosts'
import { RemoteRun } from './run'
import { claudeHereScript, dirScript, existsScript, filesScript, quote, readFileScript, shellScript, taskOutputScript, uploadScript } from './run-script'
import type { RunsStore } from './runs'
import { runOn, spawnOn } from './ssh'

/**
 * Where the application reaches the outside world, each place asked once:
 * here or on a host. A root that names a host goes over ssh; any other runs as
 * it always has.
 */


/** A script run on a host for a feature, whose connection failing marks the host out of reach, so the next call answers from what is kept rather than waiting on ssh again. */
async function ranOn(routes: Routes, host: HostConfig, script: string, options: Parameters<typeof runOn>[3]): Promise<Awaited<ReturnType<typeof runOn>>> {
  const ran = await runOn(host, routes.hosts.setup(), script, options)
  if (ran.code !== 0) routes.hosts.noteFailure(host.id, ran)
  return ran
}

export interface Routes {
  readonly hosts: Hosts
  readonly disk: HostDisk
  readonly runs: RunsStore
  readonly forwards: Forwards
}

/** Holds a conversation: a local process, or a run on its host. */
export function routedClaude(routes: Routes) {
  return (options: ClaudeOptions, hear: (heard: Heard) => void, left: () => void): Driver => {
    const id = hostOf(options.root)
    if (id === undefined) return holdClaude(options, hear, left)
    const cwd = pathOf(options.root)
    const kept = routes.runs.get(options.id)
    const launch = (args: readonly string[]): RemoteRun => {
      const run: RemoteRun = new RemoteRun({
        host: () => routes.hosts.config(id) ?? { id, name: id, address: id, user: '', port: 22, auth: 'key' },
        setup: () => routes.hosts.setup(),
        id: options.id,
        cwd,
        // Chrome is on this computer, and a run on a host has no browser to reach.
        argv: ['claude', ...args.filter((arg) => arg !== '--chrome')],
        ...(kept === undefined || kept.host !== id ? {} : { attach: kept.offset }),
        ready: async () => {
          if (await routes.hosts.ensure(id)) return undefined
          const host = routes.hosts.views().find((one) => one.id === id)
          return host?.problem ?? `Could not reach ${host?.name ?? id}.`
        },
        started: () => routes.runs.set(options.id, { host: id, root: options.root, offset: 0, started: Date.now() }),
        read: (offset) => routes.runs.read(options.id, offset),
        pending: (offset, at) => routes.runs.pending(options.id, offset, at),
        link: (up) => link(up),
      })
      const link = routes.hosts.track(id, run)
      run.once('close', () => {
        if (routes.runs.get(options.id)?.host === id) routes.runs.delete(options.id)
      })
      return run
    }
    // How much of a plan is spent is said for the account that answered, which on a host may not be this computer's.
    const heard = (said: Heard): void => hear({ ...said, signals: said.signals.filter((signal) => signal.kind !== 'plan') })
    return holdClaude({ ...options, launch }, heard, left)
  }
}

/** A `!` command, in the project's folder, on the host where the project is. */
export function routedShell(routes: Routes) {
  return (root: string, command: string, heard: (output: string) => void): Running => {
    const id = hostOf(root)
    const host = id === undefined ? undefined : routes.hosts.config(id)
    if (host === undefined) return runShell(root, command, heard)
    const child = spawnOn(host, routes.hosts.setup(), shellScript(pathOf(root), command), { tty: true })
    let both = ''
    let stopped = false
    const take = (chunk: Buffer): void => {
      both = `${both}${chunk.toString('utf8')}`.slice(-60_000)
      heard(plain(both))
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const done = new Promise<Ran>((resolve) => {
      const end = (code: number | undefined): void => {
        const output = plain(both)
        resolve({ stdout: output, stderr: '', output, code, stopped })
      }
      child.on('error', (error) => {
        both += error.message
        end(undefined)
      })
      child.on('close', (code) => end(code ?? undefined))
    })
    child.stdin.on('error', () => undefined)
    return {
      done,
      stop() {
        stopped = true
        // The terminal on the far side takes the connection going as its hang-up.
        child.kill()
      },
      write(text) {
        if (child.stdin.writable) child.stdin.write(text)
      },
    }
  }
}

/** A project's MCP servers, asked of Claude Code on its host. */
export function hostMcp(routes: Routes, root: string, change?: McpChange): Promise<McpServer[] | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return Promise.resolve(undefined)
  return readMcp(root, change, () => {
    const child = spawnOn(host, routes.hosts.setup(), claudeHereScript(pathOf(root), ['claude', ...MCP_ARGS]))
    child.stderr.resume()
    return child
  })
}

/** What a task in the background on a host printed, fetched and read as a local one is. */
export async function hostTaskOutput(routes: Routes, root: string, session: string, task: BackgroundTask): Promise<TaskOutput | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up' || !/^[A-Za-z0-9-]+$/.test(task.id)) return undefined
  // A helper's is its whole conversation; a command's, the end of what it printed.
  const most = task.kind === 'local_agent' ? 4 * 1024 * 1024 : 64_000
  const ran = await ranOn(routes, host, taskOutputScript(pathOf(root), session, task.id, task.output, most), { timeout: 30_000 })
  const here = join(tmpdir(), `geckit-task-${randomUUID()}`)
  await writeFile(here, ran.out)
  try {
    return await taskOutput(pathOf(root), here, task.kind)
  } finally {
    await rm(here, { force: true })
  }
}

/** Where a project's checkout stands, on its host where it is on one. */
export async function hostGit(routes: Routes, root: string): Promise<GitState | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return undefined
  const ran = await ranOn(routes, host, `git --no-optional-locks -C ${quote(pathOf(root))} status --porcelain=v2 --branch 2>/dev/null`, { timeout: 15_000 })
  if (ran.code !== 0 || ran.out.length === 0) return undefined
  return readGit(ran.out.toString('utf8'))
}

/** The GitHub repository a project on a host pushes to, for turning `#123` in an answer into a link. */
export async function hostRepo(routes: Routes, root: string): Promise<string | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return undefined
  const ran = await ranOn(routes, host, `git --no-optional-locks -C ${quote(pathOf(root))} remote get-url origin 2>/dev/null`, { timeout: 15_000 })
  return ran.code === 0 ? repoOf(ran.out.toString('utf8')) : undefined
}

const PICTURES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

/** A file said in a conversation on a host, read from there. */
export async function hostFile(routes: Routes, root: string, path: string): Promise<FileShown> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  const name = basename(path)
  if (host === undefined) return { kind: 'none', why: `${name} is on a host GeckIt does not know.` }
  const ran = await ranOn(routes, host, readFileScript(pathOf(root), path), { timeout: 30_000 })
  if (ran.code !== 0 || ran.out.toString('utf8', 0, 7) === '@@none\n') return { kind: 'none', why: `${name} is not on ${host.name} any more.` }
  const kind = extname(path).toLowerCase()
  const media = PICTURES[kind]
  if (media !== undefined) return { kind: 'picture', image: { media, data: ran.out.toString('base64') } }
  if (ran.out.subarray(0, 8000).includes(0)) return { kind: 'none', why: `${name} is not text that can be shown.` }
  const text = ran.out.toString('utf8')
  if (kind === '.html' || kind === '.htm') return { kind: 'page', html: text }
  return { kind: kind === '.md' || kind === '.markdown' ? 'markdown' : 'text', text }
}

/** Whether a path said in a conversation on a host is there. */
export async function hostExists(routes: Routes, root: string, path: string): Promise<boolean> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return false
  const ran = await ranOn(routes, host, existsScript(pathOf(root), path), { timeout: 15_000 })
  return ran.out.toString('utf8').trim() === 'yes'
}

/** Whether a folder itself is still on a host, for whether it is still a project. */
export async function hostIsDir(routes: Routes, root: string): Promise<boolean> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return false
  const ran = await ranOn(routes, host, dirScript(pathOf(root)), { timeout: 15_000 })
  return ran.out.toString('utf8').trim() === 'yes'
}

/** Every file of a project on a host, as paths from it, for @. */
export async function hostFiles(routes: Routes, root: string): Promise<string[]> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return []
  const ran = await ranOn(routes, host, filesScript(pathOf(root)), { timeout: 30_000 })
  return ran.out
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '')
}

/** What a terminal types to continue a conversation, or to be in a project's folder, on its host. */
export function hostTerminal(routes: Routes, root: string, run?: string): string | undefined {
  const id = hostOf(root)
  return id === undefined ? undefined : routes.hosts.terminalCommand(id, pathOf(root), run)
}

/** What a terminal types to resume a particular conversation on a host, or nothing for a local root. */
export function hostResumeLine(routes: Routes, root: string, id: string): string | undefined {
  return hostTerminal(routes, root, resumeCommand(id))
}

/**
 * Where a project's conversation files are read from for Search and Hidden
 * conversations: this computer's own folder for a local root, or the mirror
 * kept here of a host's, which only has what has already been fetched.
 */
export async function foldersFor(routes: Routes | undefined, root: string): Promise<string[]> {
  const id = hostOf(root)
  if (id === undefined) return localFolders(root)
  return routes === undefined ? [] : [routes.disk.mirrorFolder(id, root)]
}

/** How long a host's own claude is waited on for the models it names. */
const MODELS_PATIENCE = 20_000

/** How long a host's models are kept before they are asked for again. */
const MODELS_FRESH = 5 * 60_000

/** What was last asked of a host's own claude for its models: when, with what version seen then, and its answer, so two menus opened together share the one call in flight. */
const modelsAsked = new Map<string, { readonly at: number; readonly version: string | undefined; readonly models: Promise<ClaudeModel[] | undefined> }>()

/**
 * Which models a host's own claude has, greeted the same way this computer's
 * is in `sessions/models.ts`, over the connection instead of a child process
 * here. Nothing where the host is not up, so the menu shows no list rather
 * than a wrong one.
 *
 * Kept for a few minutes, since starting `claude` on a host for this is not
 * cheap and the menu can be opened again and again; dropped early where the
 * host's own version is seen to have changed, since an older or newer build
 * may name different models.
 */
export function hostModels(routes: Routes, root: string): Promise<ClaudeModel[] | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return Promise.resolve(undefined)
  const version = host.seen?.version
  const kept = modelsAsked.get(host.id)
  if (kept !== undefined && kept.version === version && Date.now() - kept.at < MODELS_FRESH) return kept.models
  const models = askHostModels(routes, host, root)
  modelsAsked.set(host.id, { at: Date.now(), version, models })
  // Not having said is not kept: the next opening of the menu asks again, rather than the menu showing no list for the whole of the freshness window.
  void models.then((said) => {
    if (said === undefined && modelsAsked.get(host.id)?.models === models) modelsAsked.delete(host.id)
  })
  return models
}

function askHostModels(routes: Routes, host: HostConfig, root: string): Promise<ClaudeModel[] | undefined> {
  const child = spawnOn(
    host,
    routes.hosts.setup(),
    claudeHereScript(pathOf(root), ['claude', ...ASK_ONLY]),
  )
  child.stderr.resume()
  return new Promise((done) => {
    let over = false
    const finish = (models: ClaudeModel[] | undefined): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      child.stdin.end()
      child.kill()
      done(models)
    }
    const patience = setTimeout(() => finish(undefined), MODELS_PATIENCE)
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: Readonly<Record<string, unknown>>
      try {
        message = JSON.parse(line) as Readonly<Record<string, unknown>>
      } catch {
        return
      }
      if (message['type'] !== 'control_response') return
      const response = (message['response'] ?? {}) as Readonly<Record<string, unknown>>
      finish(response['subtype'] === 'success' ? claudeModelsFrom((response['response'] ?? {}) as Readonly<Record<string, unknown>>) : undefined)
    })
    child.on('error', () => finish(undefined))
    child.on('close', () => finish(undefined))
    child.stdin.on('error', () => undefined)
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })}\n`)
  })
}

/** At most this much of a file goes to a host: a message is not a backup tool. */
const UPLOAD_CAP = 100 * 1024 * 1024

/** How long an upload is given before it is given up on. */
const UPLOAD_TIMEOUT = 300_000

/**
 * Copies a local file to a host, under a folder of its own so nothing there is
 * ever overwritten, and answers where it landed, `$HOME` read into what it is
 * on the host. For a local root the path is simply handed back unchanged;
 * nothing is copied.
 */
export async function hostUpload(routes: Routes, root: string, path: string): Promise<Uploaded> {
  const id = hostOf(root)
  if (id === undefined) return { path }
  const host = routes.hosts.config(id)
  const name = basename(path)
  if (host === undefined) return { problem: `Could not copy ${name}: that host is not here any more.` }
  if (routes.hosts.state(host.id) !== 'up') return { problem: `Could not copy ${name}: ${host.name} is not connected.` }
  const found = await stat(path).catch(() => undefined)
  if (found === undefined) return { problem: `Could not copy ${name}: it is not there any more.` }
  if (!found.isFile()) return { problem: `Could not copy ${name} to ${host.name}: only files are copied, not folders.` }
  if (found.size > UPLOAD_CAP) return { problem: `Could not copy ${name} to ${host.name}: it is over 100 MB.` }
  const data = await readFile(path).catch(() => undefined)
  if (data === undefined) return { problem: `Could not read ${name}.` }
  const ran = await ranOn(routes, host, uploadScript(randomUUID(), name), { input: data, timeout: UPLOAD_TIMEOUT })
  const there = ran.code === 0 ? ran.out.toString('utf8').trim() : ''
  return there === '' ? { problem: `Could not copy ${name} to ${host.name}.` } : { path: there }
}

