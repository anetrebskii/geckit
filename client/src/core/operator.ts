import { settingsCommand } from '../main/agent-settings'
import { OPERATOR_HELP } from '../shared/service'
import type { OperatorAsked, OperatorAnswered } from '../shared/service'
import { timingSafeEqual } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { assistantsIn } from '../shared/api'
import type { RequestChoice, SessionMessage, Settings } from '../shared/api'
import type { ManagerConfig } from '../shared/manager'
import { getSettings, rememberProject, setSettings } from '../main/store'
import { migrateCodexMetadata } from '../main/session-migration'
import type { CliAsked, CliAnswered } from '../main/asked'
import { providerPluginFailures } from '../main/sessions/plugins'
import { requestTasks } from './requests'
import type { CoreRuntime } from './runtime'
import { dataDirectory } from './platform'

export type ServiceAsked = CliAsked | OperatorAsked
export type { OperatorAsked, OperatorAnswered } from '../shared/service'

function messageFrom(text: string): SessionMessage {
  const value: Partial<SessionMessage> = JSON.parse(text) as Partial<SessionMessage>
  if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.root !== 'string' || typeof value.text !== 'string' || value.text.trim() === '' || !['manual', 'auto', 'plan'].includes(value.mode ?? '')) throw new Error('Use a SessionMessage with root, text and mode (manual, auto or plan).')
  const keys = ['root', 'text', 'mode', 'session', 'provider', 'model', 'employeeId', 'goal']
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`Supported message fields: ${keys.join(', ')}.`)
  for (const key of ['session', 'provider', 'model', 'employeeId', 'goal'] as const) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`${key} must be a string.`)
  if (!getSettings().projects.includes(value.root)) throw new Error('Register this project before starting a conversation.')
  if (value.provider !== undefined && !assistantsIn(getSettings()).includes(value.provider)) throw new Error('This provider is not enabled.')
  return value as SessionMessage
}

function settingsFrom(text: string): Partial<Settings> {
  const value: Partial<Settings> = JSON.parse(text) as Partial<Settings>
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Settings must be a JSON object.')
  const keys = ['chatProvider', 'chatProviders', 'chatMode', 'chatModel', 'workingAtOnce', 'vpnIpCheck', 'vpnAllowedIps', 'guideClaude', 'guideCodex', 'guidePlugins']
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`Supported settings: ${keys.join(', ')}.`)
  for (const key of ['vpnIpCheck', 'guideClaude', 'guideCodex'] as const) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${key} must be a boolean.`)
  if (value.guidePlugins !== undefined && (value.guidePlugins === null || typeof value.guidePlugins !== 'object' || Array.isArray(value.guidePlugins) || !Object.values(value.guidePlugins).every((one) => typeof one === 'boolean'))) throw new Error('guidePlugins must map provider IDs to booleans.')
  for (const key of ['chatModel', 'chatProvider'] as const) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`${key} must be a string.`)
  if (value.chatMode !== undefined && !['manual', 'auto', 'plan'].includes(value.chatMode)) throw new Error('Invalid chatMode.')
  if (value.workingAtOnce !== undefined && (!Number.isInteger(value.workingAtOnce) || value.workingAtOnce < 0)) throw new Error('workingAtOnce must be a nonnegative integer.')
  for (const key of ['chatProviders', 'vpnAllowedIps'] as const) if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every((one) => typeof one === 'string'))) throw new Error(`${key} must be an array of strings.`)
  const providers = ['claude', 'codex', ...getSettings().providerPlugins.map((one) => one.family)]
  if (value.chatProviders?.length === 0 || value.chatProviders?.some((one) => !providers.includes(one)) === true || (value.chatProvider !== undefined && !providers.includes(value.chatProvider))) throw new Error('Choose an installed provider.')
  return value
}

function managerFrom(text: string): Partial<ManagerConfig> {
  const value: Partial<ManagerConfig> = JSON.parse(text) as Partial<ManagerConfig>
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['enabled', 'provider', 'chatModel', 'instructions', 'delegation'].includes(key))) throw new Error('Use enabled, provider, chatModel, instructions or delegation.')
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('enabled must be a boolean.')
  for (const key of ['provider', 'chatModel', 'instructions'] as const) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`${key} must be a string.`)
  if (value.delegation !== undefined && value.delegation !== 'automatic' && value.delegation !== 'approve') throw new Error('Choose automatic or approve delegation.')
  return value
}

export async function operate(runtime: CoreRuntime, args: readonly string[], shutdown: () => void): Promise<string> {
  const [group, command, ...rest] = args
  const at = (index: number): string => { const value = rest[index]; if (value === undefined) throw new Error(OPERATOR_HELP); return value }
  const json = <T>(value: T): string => JSON.stringify(value, undefined, 2)
  const sessions = runtime.sessions
  if (group === 'status') return json({ state: 'ready', pid: process.pid, directory: dataDirectory(), working: sessions.working(), manager: (await runtime.manager.view()).state, providerFailures: providerPluginFailures() })
  if (group === 'shutdown') { shutdown(); return 'GeckIt service stopped.' }
  if (group === 'employees') return runtime.employees.command(args.slice(1), undefined, false, new AbortController().signal)
  if (group === 'projects') {
    if (command === 'list') return json(getSettings().projects)
    if (command === 'add') { const root = resolve(at(0)); if (!(await stat(root)).isDirectory()) throw new Error('This path is not a directory.'); rememberProject(root); return json(getSettings().projects) }
  }
  if (group === 'settings') {
    if (command === 'get') return json(getSettings())
    if (command === 'set') return json(setSettings(settingsFrom(at(0))))
  }
  if (group === 'sessions') {
    if (command === 'list') return json(await sessions.list(getSettings().projects))
    if (command === 'start' || command === 'send') {
      const message = messageFrom(at(0))
      if ((command === 'start' && message.session !== undefined) || (command === 'send' && message.session === undefined)) throw new Error('Only send takes an existing session.')
      return json({ id: await sessions.send(message) })
    }
    if (command === 'items') return json(await sessions.items(at(0)))
    if (command === 'pending') return json((await sessions.items(at(0))).filter((one) => (one.kind === 'card' && one.card.answered === undefined) || (one.kind === 'request' && one.answer === undefined) || (one.kind === 'team-request' && one.answer === undefined)))
    if (command === 'stop') { sessions.stop(at(0)); return 'Conversation stopped.' }
    if (command === 'retry') { await sessions.retry(at(0)); return 'Conversation retried.' }
    if (command === 'answer') {
      const card = (await sessions.items(at(0))).find((one) => one.id === at(1) && one.kind === 'card' && one.card.answered === undefined)
      if (card?.kind !== 'card') throw new Error('This request is no longer pending.')
      const answer = at(2)
      if ((card.card.kind === 'permission' || card.card.kind === 'start') && !['once', 'session', 'no'].includes(answer)) throw new Error('Use once, session or no for a permission card.')
      if (!await sessions.answer(at(0), at(1), answer)) throw new Error('Answer was not accepted. Refresh pending requests and check the session state.')
      return 'Answer sent.'
    }
    if (command === 'answer-team') {
      const request = (await sessions.items(at(0))).find((one) => one.id === at(1) && one.kind === 'team-request' && one.answer === undefined)
      if (request === undefined) throw new Error('This request is no longer pending.')
      const choice = at(2)
      if (choice !== 'allow' && choice !== 'decline') throw new Error('Choose allow or decline.')
      await sessions.answerTeamRequest(at(1), { allow: choice === 'allow', ...(rest[3] === undefined ? {} : { note: rest[3] }), where: 'mac' }); return 'Answer sent.'
    }
    if (command === 'answer-request') {
      const request = (await sessions.items(at(0))).find((one) => one.id === at(1) && one.kind === 'request' && one.answer === undefined)
      if (request?.kind !== 'request') throw new Error('This request is no longer pending.')
      const value: Partial<RequestChoice> = JSON.parse(at(2)) as Partial<RequestChoice>
      if (value === null || !Array.isArray(value.start) || !value.start.every((one) => typeof one === 'boolean') || !Array.isArray(value.notes) || !value.notes.every((one) => typeof one === 'string') || (value.reply !== undefined && typeof value.reply !== 'string')) throw new Error('Use start (booleans), notes (strings) and an optional reply.')
      if (value.start.length !== request.tasks.length || value.notes.length !== request.tasks.length) throw new Error('Answer each proposed task explicitly.')
      await sessions.answerRequest(at(1), { start: value.start, notes: value.notes, ...(value.reply === undefined ? {} : { reply: value.reply }), where: 'mac' })
      return 'Answer sent.'
    }
  }
  if (group === 'manager') {
    if (command === 'view') return json(await runtime.manager.view())
    if (command === 'configure') return json(await runtime.configureManager(managerFrom(at(0))))
    if (command === 'send') return json(await runtime.manager.send(at(0)))
    if (command === 'pause') return json(await runtime.manager.pause())
    if (command === 'resume') return json(await runtime.manager.resume())
    if (command === 'answer') return json(await runtime.manager.answer(at(0), at(1)))
  }
  throw new Error(OPERATOR_HELP)
}

export function serviceHandler(runtime: CoreRuntime, token: string, shutdown: () => void) {
  return async (ask: ServiceAsked, gone: AbortSignal): Promise<CliAnswered | OperatorAnswered> => {
    if (ask === null || typeof ask !== 'object' || Array.isArray(ask)) throw new Error('That was not a request GeckIt reads.')
    if (!('action' in ask)) return requestTasks(runtime.sessions, ask, gone, runtime.hostNamed)
    if (ask.action === 'operator') {
      const supplied = typeof ask.token === 'string' ? Buffer.from(ask.token) : Buffer.alloc(0)
      const expected = Buffer.from(token)
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, error: 'Operator access denied.' }
      if (!Array.isArray(ask.args) || !ask.args.every((one) => typeof one === 'string')) throw new Error('Operator arguments must be strings.')
      return { ok: true, result: await operate(runtime, ask.args, () => { if (gone.aborted) shutdown(); else gone.addEventListener('abort', shutdown, { once: true }) }) }
    }
    if (ask.action === 'settings') return { ok: true, result: settingsCommand(ask.args, getSettings, setSettings) }
    if (ask.action === 'employees') return { ok: true, result: await runtime.employees.command(ask.args, ask.session, false, gone) }
    if (ask.action === 'manage') return runtime.manager.command(ask)
    if (ask.action === 'migrate-codex') {
      if (typeof ask.imports !== 'string' || typeof ask.dryRun !== 'boolean') throw new Error('Invalid migration request.')
      const report = migrateCodexMetadata(dataDirectory(), ask.imports, ask.dryRun, { notes: runtime.notes, settings: getSettings(), saveSettings: setSettings })
      if (!ask.dryRun) await runtime.sessions.refresh(getSettings().projects)
      return { ok: true, report }
    }
    throw new Error('Unsupported GeckIt request.')
  }
}
