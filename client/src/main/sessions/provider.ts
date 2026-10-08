import { randomUUID } from 'node:crypto'

import type { Answered, Browser, ChatFound, ClaudeAccount, ClaudeModel, ClaudeProgram, McpServer, ProviderUsage, ReasoningEffort, SessionItem, SessionMode } from '../../shared/api'
import { hostOf, isRemote, remoteRoot } from '../../shared/hosts'
import type { Link } from '../../shared/links'
import { linksIn } from '../../shared/links'
import { keepCodexGuide, keepGuide } from '../guide'
import { llmProviderInfo } from '../../shared/providers'
import type { LlmProviderInfo } from '../../shared/providers'
import { claudeAccount, claudeProgram } from './account'
import { holdClaude } from './claude'
import type { ClaudeOptions } from './claude'
import { browsersOf, readBrowsers } from './chrome'
import type { CodexGoal } from './codex-protocol'
import { claudeFile, deleteClaude, everyClaude, forkPoint, listClaude, readClaudeSession, readGoal, readLinks } from './disk'
import type { Conversation, Found } from './disk'
import type { GoalRead } from './claude-read'
import type { Driver, Heard } from './heard'
import { readMcp, serversOf } from './mcp'
import type { McpChange } from './mcp'
import { claudeModels } from './models'
import { searchClaude } from './search'
import { readUsage } from './usage'
import type { Usage } from './usage'
import type { SessionsDeps } from './index'

type ProviderDeps = Pick<SessionsDeps, 'codex' | 'disk' | 'claude' | 'claudeAccount' | 'claudeModels' | 'claudeProgram' | 'usage' | 'mcp' | 'browsers' | 'search'> & {
  readonly correct?: (text: string, instruction: string, model: string) => Promise<Answered>
  readonly stopCorrect?: () => void
}

export type ProviderRow = Found & { readonly root: string; readonly project?: string; readonly created?: number; readonly importedFrom?: string; readonly actualReasoning?: ReasoningEffort }
export type ProviderGoal = GoalRead & { readonly status?: CodexGoal['status'] }
export type ProviderFork = Pick<ClaudeOptions, 'id' | 'fork'> & { readonly begun: boolean; readonly items: readonly SessionItem[] }
export type ProviderLimits = Usage & Pick<ClaudeAccount, 'limits'> & Pick<ProviderUsage, 'quotas'>
export type ProviderBrowser = Pick<Browser, 'id' | 'name'> & Partial<Pick<Browser, 'current'>>

export interface LlmProvider extends LlmProviderInfo {
  readonly available: boolean
  readonly localOnly: boolean
  readonly subscriptionOnly: boolean
  readonly images: boolean
  readonly remoteControl: boolean
  readonly nativeGoals: boolean
  readonly idleMs: number
  readonly waitForExit: boolean
  account(): Promise<ClaudeAccount>
  program(): Promise<ClaudeProgram | undefined>
  models(root?: string): Promise<ClaudeModel[] | undefined>
  limits(models: readonly string[]): Promise<ProviderLimits>
  list(roots: readonly string[]): Promise<ProviderRow[]>
  search(roots: readonly string[], asked: string): Promise<ChatFound[]>
  hidden(from: number, to: number, include: (id: string) => boolean): Promise<Found[]>
  create(options: Pick<ClaudeOptions, 'root' | 'mode' | 'model'>): Promise<string>
  fork(root: string, id: string, at: number, mode: SessionMode, model?: string): Promise<ProviderFork>
  has(root: string, id: string): Promise<boolean>
  read(root: string, id: string): Promise<Conversation | undefined>
  links(root: string, id: string): Promise<Link[]>
  goal(root: string, id: string): Promise<ProviderGoal | undefined>
  setGoal(id: string, objective: string): Promise<ProviderGoal | undefined>
  clearGoal(id: string): Promise<void>
  hold(options: ClaudeOptions, hear: (heard: Heard) => void, left: () => void): Driver
  rename(id: string, name: string, driver?: Driver): Promise<void>
  remote(driver: Driver, enabled: boolean, name?: string): Promise<string | undefined>
  mcp(root: string, change?: McpChange, driver?: Driver): Promise<McpServer[] | undefined>
  browsers(root?: string, pick?: string, driver?: Driver): Promise<ProviderBrowser[] | undefined>
  correct(text: string, instruction: string, model: string): Promise<Answered>
  setInstructions(enabled: boolean, browserNames: Readonly<Record<string, string>>): Promise<void>
  delete(root: string, id: string): Promise<boolean>
  dispose(): void
}

const shownGoal = (goal: CodexGoal | null): ProviderGoal => ({
  ...(goal === null || goal.status === 'complete' ? {} : { goal: { condition: goal.objective, checks: 0 } }),
  ...(goal === null ? {} : { status: goal.status }),
})

export function llmProvider(deps: ProviderDeps, family: 'claude' | 'codex'): LlmProvider {
  const info = llmProviderInfo(family)
  if (family === 'codex') return {
    ...info,
    available: deps.codex !== undefined,
    localOnly: true,
    subscriptionOnly: true,
    images: true,
    remoteControl: false,
    nativeGoals: true,
    idleMs: 10 * 60_000,
    waitForExit: true,
    account: () => deps.codex?.account() ?? Promise.resolve({ provider: 'codex', here: false, signedIn: undefined }),
    program: async () => (await deps.codex?.account())?.program,
    models: (root) => root !== undefined && isRemote(root) ? Promise.resolve(undefined) : deps.codex?.models() ?? Promise.resolve(undefined),
    limits: async () => {
      const limits = (await deps.codex?.account())?.limits
      return { windows: new Map<string, number | undefined>(), ...(limits === undefined ? {} : { limits }) }
    },
    list: (roots) => deps.codex?.list(roots.filter((root) => !isRemote(root))) ?? Promise.resolve([]),
    search: (roots, asked) => deps.codex?.search(roots.filter((root) => !isRemote(root)), asked) ?? Promise.resolve([]),
    hidden: async () => [],
    create: ({ root, mode, model }) => {
      if (deps.codex === undefined) throw new Error('Codex is not available. Install Codex and run codex login in a terminal.')
      return deps.codex.create(root, mode, model)
    },
    fork: async (root, id, at, mode, model) => {
      if (deps.codex === undefined) throw new Error('Codex is not available.')
      const turns = await deps.codex.turns(id)
      const point = turns.findLast((turn) => turn.status !== 'inProgress' && turn.startedAt !== null && turn.startedAt * 1000 <= at)?.id
      return { id: await deps.codex.create(root, mode, model, { from: id, ...(point === undefined ? {} : { at: point }) }), begun: true, items: [] }
    },
    has: async () => false,
    read: (root, id) => deps.codex?.read(root, id) ?? Promise.resolve(undefined),
    links: async (root, id) => linksIn((await deps.codex?.read(root, id))?.items ?? []),
    goal: async (_root, id) => deps.codex === undefined ? undefined : shownGoal(await deps.codex.goal(id)),
    setGoal: async (id, objective) => deps.codex === undefined ? undefined : shownGoal(await deps.codex.setGoal(id, objective)),
    clearGoal: (id) => deps.codex?.clearGoal(id) ?? Promise.resolve(),
    hold: (options, hear, left) => {
      if (deps.codex === undefined) throw new Error('Codex is not available. Install Codex and run codex login in a terminal.')
      return deps.codex.hold(options, hear, left)
    },
    rename: async (id, name) => { deps.codex?.rename(id, name) },
    remote: async () => { throw new Error('Remote Control is available only for Claude Code in Stream mode.') },
    mcp: async () => undefined,
    browsers: async () => undefined,
    correct: (text, instruction, model) => deps.codex?.correct(text, instruction, model) ?? Promise.resolve({ ok: false, error: 'Codex is not available.' }),
    setInstructions: (enabled) => keepCodexGuide(enabled),
    delete: (_root, id) => deps.codex?.delete(id) ?? Promise.resolve(false),
    dispose: () => deps.codex?.dispose(),
  }

  return {
    ...info,
    available: true,
    localOnly: false,
    subscriptionOnly: true,
    images: true,
    remoteControl: true,
    nativeGoals: false,
    idleMs: 10 * 60_000,
    waitForExit: false,
    account: () => (deps.claudeAccount ?? claudeAccount)(),
    program: () => (deps.claudeProgram ?? claudeProgram)(),
    models: (root) => (deps.claudeModels ?? claudeModels)(root),
    limits: (models) => (deps.usage ?? readUsage)(models),
    list: async (roots) => {
      const rows: ProviderRow[] = []
      for (const root of roots) {
        const found = await (deps.disk?.list ?? listClaude)(root).catch(() => [])
        for (const { below, ...row } of found) {
          const host = hostOf(root)
          rows.push(below === undefined ? { ...row, root } : { ...row, root: host === undefined || isRemote(below) ? below : remoteRoot(host, below), project: root })
        }
      }
      return rows
    },
    search: (roots, asked) => (deps.search ?? searchClaude)(roots, asked),
    hidden: (from, to, include) => (deps.disk?.every ?? everyClaude)(from, to, include),
    create: async () => randomUUID(),
    fork: async (root, id, at) => {
      const point = await (deps.disk?.forkPoint ?? forkPoint)(root, id, at).catch(() => undefined)
      const read = await (deps.disk?.read ?? readClaudeSession)(root, id).catch(() => undefined)
      const items = read?.items ?? []
      const upTo = items.findLastIndex((item) => 'at' in item && item.at !== undefined && item.at <= at)
      return { id: randomUUID(), fork: { from: id, ...(point === undefined ? {} : { at: point }) }, begun: false, items: items.slice(0, upTo + 1) }
    },
    has: (root, id) => deps.disk?.has(root, id) ?? claudeFile(root, id).then((path) => path !== undefined),
    read: (root, id) => (deps.disk?.read ?? readClaudeSession)(root, id),
    links: (root, id) => (deps.disk?.links ?? readLinks)(root, id),
    goal: (root, id) => (deps.disk?.goal ?? readGoal)(root, id),
    setGoal: async () => undefined,
    clearGoal: async () => undefined,
    hold: deps.claude ?? holdClaude,
    rename: async (id, name, driver) => { await driver?.control?.({ subtype: 'rename_session', title: name, source: 'host', session_id: id }) },
    remote: async (driver, enabled, name) => {
      if (driver.control === undefined) throw new Error('Remote Control is available in Stream mode.')
      const answer = await driver.control({ subtype: 'remote_control', enabled, ...(name === undefined ? {} : { name }) })
      return typeof answer['session_url'] === 'string' ? answer['session_url'] : undefined
    },
    mcp: async (root, change, driver) => {
      if (driver?.control !== undefined) {
        try {
          if (change !== undefined) await driver.control({ subtype: 'mcp_toggle', serverName: change.name, enabled: change.enabled })
          return serversOf(await driver.control({ subtype: 'mcp_status' }))
        } catch { /* Fall back to project settings. */ }
      }
      return (deps.mcp ?? readMcp)(root, change)
    },
    browsers: async (root, pick, driver) => {
      if (root === undefined) return undefined
      if (driver?.control !== undefined) {
        try {
          if (pick !== undefined) await driver.control({ subtype: 'select_chrome_browser', device_id: pick })
          return browsersOf(await driver.control({ subtype: 'get_chrome_browsers' }))
        } catch { /* Fall back to the local browser list. */ }
      }
      return (deps.browsers ?? readBrowsers)(root, pick)
    },
    correct: (text, instruction, model) => deps.correct?.(text, instruction, model) ?? Promise.resolve({ ok: false, error: 'Claude Code correction is not available.' }),
    setInstructions: (enabled, browserNames) => keepGuide(enabled, browserNames),
    delete: (root, id) => (deps.disk?.delete ?? deleteClaude)(root, id),
    dispose: () => deps.stopCorrect?.(),
  }
}
