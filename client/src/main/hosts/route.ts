import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

import type { BackgroundTask, FileShown, GitState, McpServer, TaskOutput } from '../../shared/api'
import { hostOf, pathOf } from '../../shared/hosts'
import { readGit } from '../git'
import { holdClaude } from '../sessions/claude'
import type { ClaudeOptions } from '../sessions/claude'
import { folders as localFolders } from '../sessions/disk'
import type { Driver, Heard } from '../sessions/heard'
import { MCP_ARGS, readMcp } from '../sessions/mcp'
import type { McpChange } from '../sessions/mcp'
import { plain, runShell } from '../sessions/shell'
import { taskOutput } from '../sessions/tasks'
import type { Ran, Running } from '../sessions/shell'
import type { HostDisk } from './disk'
import type { Forwards } from './forward'
import type { Hosts } from './hosts'
import { RemoteRun } from './run'
import { claudeHereScript, existsScript, filesScript, quote, readFileScript, shellScript, taskOutputScript } from './run-script'
import type { RunsStore } from './runs'
import { runOn, spawnOn } from './ssh'

/**
 * Where the application reaches the outside world, each place asked once:
 * here or on a host. A root that names a host goes over ssh; any other runs as
 * it always has.
 */

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
  const ran = await runOn(host, routes.hosts.setup(), taskOutputScript(pathOf(root), session, task.id, task.output, most), { timeout: 30_000 })
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
  const ran = await runOn(host, routes.hosts.setup(), `git --no-optional-locks -C ${quote(pathOf(root))} status --porcelain=v2 --branch 2>/dev/null`, { timeout: 15_000 })
  if (ran.code !== 0 || ran.out.length === 0) return undefined
  return readGit(ran.out.toString('utf8'))
}

const PICTURES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

/** A file said in a conversation on a host, read from there. */
export async function hostFile(routes: Routes, root: string, path: string): Promise<FileShown> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  const name = basename(path)
  if (host === undefined) return { kind: 'none', why: `${name} is on a host GeckIt does not know.` }
  const ran = await runOn(host, routes.hosts.setup(), readFileScript(pathOf(root), path), { timeout: 30_000 })
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
  const ran = await runOn(host, routes.hosts.setup(), existsScript(pathOf(root), path), { timeout: 15_000 })
  return ran.out.toString('utf8').trim() === 'yes'
}

/** Every file of a project on a host, as paths from it, for @. */
export async function hostFiles(routes: Routes, root: string): Promise<string[]> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return []
  const ran = await runOn(host, routes.hosts.setup(), filesScript(pathOf(root)), { timeout: 30_000 })
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

