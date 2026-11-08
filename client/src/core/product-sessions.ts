import { randomUUID } from 'node:crypto'
import type { CoreMethods } from './application'
import type { ProductAuthority } from '../shared/product-cli'
import type { PreparedConversationDraft, SessionMessage } from '../shared/api'
import { providerOf } from '../shared/api'
import { getSettings } from '../main/store'
import { requestedProvider } from '../cli/start'
import { flagsFrom, required, expectedValues, jsonInput, onlyFields } from './product-input'

export const SESSION_READS = ['list', 'show', 'search', 'hidden', 'status', 'plans', 'links', 'waiting', 'task-output', 'draft']
export const SESSION_COMMANDS = {
  list: ['--project'], show: ['--id', '--last'], search: ['--text', '--project'], hidden: [], status: [], plans: [],
  start: ['--project', '--provider', '--mode', '--text', '--goal', '--model', '--employee'],
  prepare: ['--project', '--provider', '--mode', '--text', '--goal', '--model', '--employee'],
  schedule: ['--project', '--provider', '--mode', '--text', '--goal', '--model', '--employee'],
  send: ['--id', '--text'], stop: ['--id'], retry: ['--id'], steer: ['--id', '--text'], proceed: ['--id'],
  rename: ['--id', '--title'], mark: ['--id', '--status'], hide: ['--id'], delete: ['--id'], bring: ['--id'], read: ['--id'], release: ['--id'],
  assign: ['--id', '--employee'], mode: ['--id', '--mode'], transport: ['--id', '--transport'], keep: ['--id', '--on'],
  export: ['--id'], copy: ['--id', '--provider', '--model', '--text'], continue: ['--id', '--provider', '--model', '--text'],
  unqueue: ['--id', '--queued'], requeue: ['--id', '--queued', '--text'], reorder: ['--id', '--queued', '--target', '--after'],
  delegate: ['--id', '--queued', '--history'], 'inject-queued': ['--id', '--queued'],
  'stop-task': ['--id', '--task'], 'clear-task': ['--id', '--task'], 'task-output': ['--id', '--task'], background: ['--id', '--item'],
  answer: ['--id', '--card', '--text'], links: ['--id'], waiting: ['--id'], draft: ['--id'], 'save-draft': ['--id', '--patch', '--expected'], mcp: ['--id', '--server', '--enabled'], browsers: ['--id', '--pick'],
} as const

export async function productSessions(api: CoreMethods, args: readonly string[], authority: ProductAuthority): Promise<string> {
  const [command, ...rest] = args
  if (command === undefined || !Object.hasOwn(SESSION_COMMANDS, command)) throw new Error('Unsupported session command. Run capabilities on this target.')
  if (authority === 'manager' && !SESSION_READS.includes(command)) throw new Error('Remote Manager session writes require target Manager ownership and approvals. Use manager send --text; no operator fallback was used.')
  const flags = flagsFrom(rest, SESSION_COMMANDS[command as keyof typeof SESSION_COMMANDS])
  const json = <T>(value: T): string => JSON.stringify(value ?? null)
  const project = flags.get('--project')
  if (project !== undefined && !getSettings().projects.includes(project)) throw new Error('Choose an exact registered project root from projects list.')
  if (command === 'list') return json(await api['chat:list'](project))
  if (command === 'search') return json(await api['chat:search'](required(flags, '--text'), project))
  if (command === 'hidden') return json(await api['chat:hidden'](true))
  if (command === 'status') return json(api['chat:listStatus']())
  if (command === 'plans') return json(api['chat:plans']())
  const enabled = (named: string): NonNullable<SessionMessage['provider']> => {
    const provider = requestedProvider(named)
    if (provider === undefined || !getSettings().chatProviders.includes(provider)) throw new Error('Choose an enabled provider. No replacement was selected.')
    return provider
  }
  const mode = (value: string): SessionMessage['mode'] => {
    if (value !== 'manual' && value !== 'auto' && value !== 'plan') throw new Error('Mode must be manual, auto or plan.')
    return value
  }
  const bool = (key: string): boolean => {
    const value = required(flags, key)
    if (value !== 'true' && value !== 'false') throw new Error(`${key} must be true or false.`)
    return value === 'true'
  }
  if (command === 'start' || command === 'prepare' || command === 'schedule') {
    const root = required(flags, '--project')
    const provider = enabled(flags.get('--provider') ?? getSettings().projectAssistants.find((one) => one.root === root)?.provider ?? getSettings().chatProvider)
    const message: SessionMessage = { root, provider, mode: mode(flags.get('--mode') ?? getSettings().chatMode), text: required(flags, '--text'), ...(flags.has('--goal') ? { goal: required(flags, '--goal') } : {}), ...(flags.has('--model') ? { model: required(flags, '--model') } : {}), ...(flags.has('--employee') ? { employeeId: required(flags, '--employee') } : {}) }
    if (message.model !== undefined && !(await api['chat:models'](root, provider))?.some((one) => one.value === message.model && one.disabled !== true)) throw new Error('Selected model is unavailable; no replacement was selected.')
    if (!getSettings().projects.includes(root) || !getSettings().chatProviders.includes(provider)) throw new Error('Project or provider changed before dispatch.')
    return json({ id: command === 'start' ? await api['chat:send'](message) : command === 'prepare' ? api['chat:prepare'](message) : api['chat:schedule'](message) })
  }
  const id = required(flags, '--id')
  const session = (await api['chat:list'](undefined)).find((one) => one.id === id)
  const hidden = command === 'bring' && (await api['chat:hidden'](true)).flatMap((one) => one.chats).some((one) => one.id === id)
  if (session === undefined && !hidden) throw new Error('Choose an exact session ID from sessions list or sessions hidden on this target.')
  if (session?.manager === true && !SESSION_READS.includes(command)) throw new Error('Use Manager commands for its own sessions.')
  if (['send', 'retry', 'proceed', 'steer', 'delegate', 'inject-queued', 'mode', 'transport', 'mcp', 'browsers', 'background'].includes(command)) enabled(providerOf(id))
  if (command === 'show') {
    const last = Number(flags.get('--last') ?? 30)
    if (!Number.isInteger(last) || last < 1 || last > 1000) throw new Error('--last must be from 1 to 1000.')
    return json({ session, items: (await api['chat:items'](id)).slice(-last) })
  }
  if (command === 'links') return json(await api['chat:links'](id))
  if (command === 'waiting') return json(await api['chat:waiting'](id))
  if (command === 'draft') return json(api['chat:preparedDraft'](id))
  if (command === 'save-draft') {
    if (session?.prepared !== true) throw new Error('This session is not prepared.')
    const patch = jsonInput(required(flags, '--patch'))
    onlyFields(patch, ['text', 'model', 'reasoning'])
    if (Object.values(patch).some((one) => typeof one !== 'string') || patch.reasoning !== undefined && !['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(String(patch.reasoning))) throw new Error('Draft values must be text, model and valid reasoning strings.')
    if (typeof patch.model === 'string' && patch.model !== '' && !(await api['chat:models'](session.root, enabled(providerOf(id))))?.some((one) => one.value === patch.model && one.disabled !== true)) throw new Error('Selected model is unavailable; no replacement was selected.')
    expectedValues({ text: api['chat:preparedDraft'](id) ?? '', model: session.chosen ?? '', reasoning: session.reasoning ?? '' }, required(flags, '--expected'), ['text', 'model', 'reasoning'])
    api['chat:savePreparedDraft'](id, patch as PreparedConversationDraft)
    return json({ saved: true, id })
  }
  if (command === 'mcp' || command === 'browsers') {
    if (session === undefined) throw new Error('Unknown session.')
    enabled(providerOf(id))
    if (command === 'browsers') return json(await api['chat:browsers'](session.root, id, flags.get('--pick')))
    if (flags.has('--server') !== flags.has('--enabled')) throw new Error('Supply --server and --enabled together.')
    return json(await api['chat:mcp'](session.root, id, flags.has('--server') ? { name: required(flags, '--server'), enabled: bool('--enabled') } : undefined))
  }
  if (command === 'send') {
    if (session === undefined) throw new Error('Unknown session.')
    return json({ id: await api['chat:send']({ session: id, root: session.root, provider: enabled(providerOf(id)), mode: session.mode, text: required(flags, '--text') }) })
  }
  if (command === 'stop') api['chat:stop'](id)
  else if (command === 'retry') return json(await api['chat:retry'](id))
  else if (command === 'steer') return json(await api['chat:steer'](id, required(flags, '--text'), randomUUID()))
  else if (command === 'proceed') {
    await api['chat:proceed']([id])
    return json({ id, resumeRequested: true, notice: 'Read session state; only a persisted interrupted turn can resume.' })
  }
  else if (command === 'rename') api['chat:rename'](id, required(flags, '--title'))
  else if (command === 'mark') {
    const status = required(flags, '--status')
    if (status !== 'todo' && status !== 'progress' && status !== 'blocked' && status !== 'done' && status !== 'archived') throw new Error('Use todo, progress, blocked, done or archived.')
    api['chat:mark'](id, status === 'progress' ? undefined : status)
  } else if (command === 'hide') api['chat:hide'](id)
  else if (command === 'delete') return json({ id, deleted: (await api['chat:delete']([id])).includes(id), projectFilesKept: true })
  else if (command === 'bring') api['chat:bring'](id)
  else if (command === 'release') {
    if (session?.state === 'working' || session?.state === 'asks' || session?.remote !== undefined || session?.tasks?.some((one) => one.status === 'running')) throw new Error('Stop or finish work before releasing its runtime; Remote Control sessions cannot be released here.')
    api['chat:handOver'](id)
    return json({ id, releaseRequested: true, notice: 'Provider disable rechecks held and closing runtimes before saving.' })
  }
  else if (command === 'read') api['chat:read'](id)
  else if (command === 'assign') api['chat:assignEmployee'](id, required(flags, '--employee') === 'none' ? null : required(flags, '--employee'))
  else if (command === 'mode') {
    const selected = mode(required(flags, '--mode'))
    await api['chat:mode'](id, selected)
    if ((await api['chat:list'](undefined)).find((one) => one.id === id)?.mode !== selected) throw new Error('Mode was not changed. Read session state and resolve its native guard before retrying.')
  }
  else if (command === 'transport') {
    const transport = required(flags, '--transport')
    if (transport !== 'tmux' && transport !== 'stream') throw new Error('Transport must be tmux or stream.')
    if (providerOf(id) !== 'claude' || transport !== 'stream' && session?.transport !== transport || session?.state === 'working' || session?.state === 'asks' || session?.remote !== undefined) throw new Error('Transport selection is unavailable for this session. Only an idle local Claude session can switch to stream.')
    api['chat:transport'](id, transport)
    const current = (await api['chat:list'](undefined)).find((one) => one.id === id)
    if (current?.transport !== transport) throw new Error('Transport was not changed. Read session state before retrying.')
  } else if (command === 'keep') {
    if (session?.question !== true) throw new Error('Only a general question supports keep.')
    const on = bool('--on')
    api['chat:keep'](id, on)
    if ((await api['chat:list'](undefined)).find((one) => one.id === id)?.stays !== on) throw new Error('Question retention did not change. Read current session state.')
  }
  else if (command === 'export') return json(await api['chat:exportConversation'](id))
  else if (command === 'copy' || command === 'continue') {
    const request = { source: id, text: flags.get('--text') ?? '', provider: enabled(required(flags, '--provider')), ...(flags.has('--model') ? { model: required(flags, '--model') } : {}) }
    if (request.model !== undefined && !(await api['chat:models'](session?.root, request.provider))?.some((one) => one.value === request.model && one.disabled !== true)) throw new Error('Selected model is unavailable; no replacement was selected.')
    enabled(request.provider)
    return json(command === 'copy' ? await api['chat:copyConversation'](request) : await api['chat:continueConversation'](request))
  } else if (command === 'unqueue') {
    const removed = api['chat:unqueue'](id, required(flags, '--queued'))
    if (removed === undefined) throw new Error('Queued message changed or is being delivered. Read session state before retrying.')
    return json(removed)
  }
  else if (command === 'requeue') {
    const queued = required(flags, '--queued'); const text = required(flags, '--text').trim()
    if (!session?.queued?.some((one) => one.id === queued)) throw new Error('Unknown queued message.')
    api['chat:requeue'](id, queued, text)
    if (!(await api['chat:list'](undefined)).find((one) => one.id === id)?.queued?.some((one) => one.id === queued && one.text === text)) throw new Error('Queued message changed or is being delivered. Read session state before retrying.')
  }
  else if (command === 'reorder') {
    const queued = required(flags, '--queued'); const target = required(flags, '--target'); const after = bool('--after')
    if (queued === target || ![queued, target].every((key) => session?.queued?.some((one) => one.id === key))) throw new Error('Select two distinct current queued messages.')
    api['chat:reorderQueued'](id, queued, target, after)
    const queue = (await api['chat:list'](undefined)).find((one) => one.id === id)?.queued ?? []
    const at = queue.findIndex((one) => one.id === target)
    if (at < 0 || queue[at + (after ? 1 : -1)]?.id !== queued) throw new Error('Queue changed or is being delivered. Read session state before retrying.')
  }
  else if (command === 'delegate') {
    const started = await api['chat:delegate'](id, required(flags, '--queued'), flags.has('--history') && bool('--history'))
    if (started === undefined) throw new Error('Queued delegation was not accepted. Read session state before retrying.')
    return json({ id: started })
  }
  else if (command === 'inject-queued') {
    const queued = required(flags, '--queued')
    if (session?.canInject !== true || session.injecting !== undefined || !session.queued?.some((one) => one.id === queued)) throw new Error('This queued message cannot be delivered now.')
    await api['chat:injectQueued'](id, queued)
    if ((await api['chat:list'](undefined)).find((one) => one.id === id)?.queued?.some((one) => one.id === queued)) throw new Error('Queued message was not delivered. Read session state and resolve its native guard.')
  }
  else if (command === 'stop-task') {
    const task = required(flags, '--task')
    if (session?.canStopTasks !== true || !session.tasks?.some((one) => one.id === task && ['running', 'asks', 'unknown'].includes(one.status))) throw new Error('This task cannot be stopped through the current runtime.')
    api['chat:stopTask'](id, task)
    return json({ id, task, stopRequested: true, notice: 'Provider control is asynchronous. Read session tasks to confirm completion.' })
  }
  else if (command === 'clear-task') {
    const task = required(flags, '--task')
    if (!session?.tasks?.some((one) => one.id === task && ['completed', 'failed', 'stopped'].includes(one.status))) throw new Error('Choose an existing finished task.')
    api['chat:clearTask'](id, task)
    if ((await api['chat:list'](undefined)).find((one) => one.id === id)?.tasks?.some((one) => one.id === task)) throw new Error('Task list changed before clearing. Read current state.')
  }
  else if (command === 'task-output') return json(await api['chat:taskOutput'](id, required(flags, '--task')))
  else if (command === 'background') {
    if (session?.held !== true || session.checkingIp === true) throw new Error('The session has no available runtime for background control.')
    await api['chat:toBackground'](id, required(flags, '--item'))
    return json({ id, backgroundRequested: true, notice: 'Read session state; provider and native guards can decline asynchronous control.' })
  }
  else if (command === 'answer') {
    const card = required(flags, '--card')
    const item = (await api['chat:items'](id)).find((one) => one.id === card)
    if (item?.kind !== 'card' || item.card.kind !== 'question' || item.card.answered !== undefined) throw new Error('Only a current question can be answered. Native permissions require the bound human flow.')
    if (!await api['chat:answer'](id, card.replace(/^card:/, ''), required(flags, '--text'))) throw new Error('Question changed before delivery. Read the current waiting card before retrying.')
  } else throw new Error('Unsupported session command.')
  return json({ id, saved: true })
}
