import { CodexSessions, keepCodexGuide, launchCodex, linksIn, providerQuotas } from './codex-runtime.mjs'
import { modelOverrides } from './model-overrides.mjs'

const family = 'plugin:codex-mirror'
const mirror = (id) => `${family}:${id.slice('codex:'.length)}`
const native = (id) => {
  if (!id.startsWith(`${family}:`)) throw new Error('Session does not belong to Codex Mirror.')
  return `codex:${id.slice(family.length + 1)}`
}
const goalShown = (goal) => ({
  ...(goal === null || goal.status === 'complete' ? {} : { goal: { condition: goal.objective, checks: 0 } }),
  ...(goal === null ? {} : { status: goal.status }),
})

export function create(context = {}) {
  const log = (level, event, fields) => { try { context.log?.write(level, event, fields) } catch {} }
  const codex = new CodexSessions(() => launchCodex(), undefined, log)
  log('info', 'provider.created')
  return {
    id: family,
    family,
    name: 'Codex Mirror',
    shortName: 'Codex Mirror',
    icon: 'codex-mirror',
    browser: 'codex',
    loginCommand: 'codex login',
    planName: 'ChatGPT',
    runtime: 'codex',
    available: true,
    localOnly: true,
    subscriptionOnly: true,
    images: true,
    remoteControl: false,
    nativeGoals: true,
    idleMs: 10 * 60_000,
    waitForExit: true,
    account: async () => ({ ...await codex.account(), provider: family }),
    program: async () => (await codex.account()).program,
    models: async () => (await codex.models())?.map((model) => ({ ...model, ...modelOverrides.get(model.id ?? model.value) })),
    limits: async (models) => {
      const account = await codex.account()
      return {
        windows: new Map(models.map((id) => [id, modelOverrides.get(id)?.contextWindow])),
        ...(account.limits === undefined ? {} : { quotas: providerQuotas({ limits: account.limits }) }),
      }
    },
    list: async (roots) => (await codex.list(roots)).map((row) => ({ ...row, id: mirror(row.id), driven: false })),
    search: async (roots, asked) => (await codex.search(roots, asked)).map((row) => ({ ...row, id: mirror(row.id) })),
    hidden: async () => [],
    create: async ({ root, mode, model }) => mirror(await codex.create(root, mode, model)),
    fork: async (root, id, at, mode, model) => {
      const point = (await codex.turns(native(id))).findLast((turn) => turn.status !== 'inProgress' && turn.startedAt !== null && turn.startedAt * 1000 <= at)?.id
      return { id: mirror(await codex.create(root, mode, model, { from: native(id), ...(point === undefined ? {} : { at: point }) })), begun: true, items: [] }
    },
    has: async (root, id) => (await codex.read(root, native(id))) !== undefined,
    read: (root, id) => codex.read(root, native(id)),
    links: async (root, id) => linksIn((await codex.read(root, native(id)))?.items ?? []),
    goal: async (_root, id) => goalShown(await codex.goal(native(id))),
    setGoal: async (id, objective) => goalShown(await codex.setGoal(native(id), objective)),
    clearGoal: (id) => codex.clearGoal(native(id)),
    hold: (options, hear, left) => {
      const driver = codex.hold({ ...options, id: native(options.id) }, (heard) => {
        for (const signal of heard.signals) {
          if (signal.kind === 'begun') log('info', 'session.turn.begun', { session: options.id })
          if (signal.kind === 'started') log('info', 'session.started', { session: options.id })
          if (signal.kind === 'ended') log(signal.how === 'failed' ? 'warn' : 'info', 'session.turn.ended', { session: options.id, outcome: signal.how })
        }
        hear({ ...heard, signals: heard.signals.map((signal) => signal.kind === 'started' && signal.session !== '' ? { ...signal, session: mirror(signal.session) } : signal) })
      }, () => { log('info', 'session.closed', { session: options.id }); left() })
      return {
        ...driver,
        send: (...args) => { log('info', 'message.send.requested', { session: options.id }); return driver.send(...args) },
        ...typeof driver.inject !== 'function' ? {} : { inject: async (...args) => {
          log('info', 'message.inject.requested', { session: options.id })
          try { await driver.inject(...args); log('info', 'message.inject.completed', { session: options.id }) }
          catch (error) { log('warn', 'message.inject.failed', { session: options.id, errorKind: error?.name ?? 'Error' }); throw error }
        } },
      }
    },
    rename: async (id, name) => { await codex.rename(native(id), name) },
    remote: async () => { throw new Error('Codex Mirror does not support remote control.') },
    mcp: async () => undefined,
    browsers: async () => undefined,
    correct: (text, instruction, model) => codex.correct(text, instruction, model),
    setInstructions: (enabled) => keepCodexGuide(enabled),
    delete: (_root, id) => codex.delete(native(id)),
    dispose: () => { log('info', 'provider.disposed'); codex.dispose() },
  }
}
