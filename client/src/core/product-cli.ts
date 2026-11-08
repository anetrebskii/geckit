import { hostname } from 'node:os'
import { stat, mkdir } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { application } from './application'
import type { CoreRuntime } from './runtime'
import { getSettings, forgetProject, rememberProject, setSettings } from '../main/store'
import { settingsCommand } from '../main/agent-settings'
import { assertProviderUnused, providerSettings } from '../main/provider-settings'
import { requestedProvider } from '../cli/start'
import type { HostDraft } from '../shared/hosts'
import type { ChannelChange } from '../shared/channels'
import { channelId } from '../shared/channels'
import type { ManagerConfig } from '../shared/manager'
import { managerProvider } from '../main/manager-operations'
import { AGENT_SETTINGS_SCHEMA } from '../shared/agent-settings'

import type { ProductAuthority } from '../shared/product-cli'
import { productShortcuts } from './product-shortcuts'
import { productSessions, SESSION_COMMANDS, SESSION_READS } from './product-sessions'
import { PRODUCT_COMMANDS } from '../shared/product-cli'

import { flagsFrom, required, expectedValues, jsonInput, onlyFields, stringList, intakeInput } from './product-input'
export async function dispatchProduct(runtime: CoreRuntime, args: readonly string[], authority: ProductAuthority = 'operator'): Promise<string> {
  if (authority !== 'operator' && authority !== 'manager') throw new Error('Unsupported product authority.')
  if (!Array.isArray(args) || args.length === 0 || args.length > 100 || !args.every((one) => typeof one === 'string' && one.length <= 100_000)) throw new Error('Product CLI arguments must be literal strings.')
  const [domain, command, ...rest] = args
  const json = <T>(value: T): string => JSON.stringify(value ?? null)
  const target = { name: hostname(), platform: process.platform, calendarTimeZone: getSettings().calendarTimeZone }
  if (domain === 'capabilities' && args.length === 1 || command === 'schema' && rest.length === 0 && ['providers', 'projects', 'hosts', 'channels', 'manager', 'shortcuts', 'sessions', 'speech', 'browser-config'].includes(domain ?? '')) return json({
    target, authority,
    commands: authority === 'manager' ? [...PRODUCT_COMMANDS.filter((one) => !one.startsWith('sessions ') && !one.startsWith('employees ')), 'sessions list|show|search|hidden|status|plans|links|waiting|task-output|draft', 'employees list|show|memory|shortcuts|shortcut|rename'] : PRODUCT_COMMANDS,
    sessions: Object.fromEntries(Object.entries(SESSION_COMMANDS).filter(([name]) => authority === 'operator' || SESSION_READS.includes(name))),
    schemas: { manager: { patch: ['enabled', 'provider', 'chatModel', 'delegation', 'intake'], intake: 'validated retained source settings; enabled:false only; automatic intake is retired, use Manager shortcuts', instructions: 'settings manager-edit', expected: 'nonempty last-read field subset' }, hosts: { draft: ['name', 'address', 'user', 'port', 'auth', 'keyFile'], native: ['password', 'passphrase', 'code', 'trustNewKey'] }, channels: { patch: ['enabled', 'projects', 'manager', 'config'], fields: getSettings().channels.map((one) => ({ id: one.info.id, fields: one.info.fields, secrets: 'native setup only' })) }, shortcuts: { draft: ['id', 'name', 'root', 'prompt', 'mode', 'on', 'provider', 'reasoning', 'target', 'goal', 'model', 'employeeId', 'cron', 'recurrence', 'startWindowMinutes'], expected: 'entire previous draft or null for creation' } },
    limitations: authority === 'manager' ? ['Session writes require target Manager ownership and approvals. Send work through manager send.', 'Remote team editing is operator-only except expected-name rename and saved shortcuts.'] : [],
    settings: AGENT_SETTINGS_SCHEMA,
    boundaries: ['Interactive authentication, secret entry, pairing codes and native permission answers require the user-bound native flow.', 'Only full-control paired devices may execute product commands; observation-only devices are refused.', 'SSH hosts run conversations; only paired GeckIt computers support --host configuration.', 'No arbitrary shell or automatic GeckIt restart. Bulk configuration import remains the native restart/backup flow; dedicated commands configure its entities without restarting.'],
  })
  if (['computers', 'devices', 'access'].includes(domain ?? '')) return runtime.cliRegistry(args)
  if (domain === 'settings' && command === 'manager' && rest.length === 0) return json({ instructions: runtime.manager.instructions() })
  if (domain === 'settings' && command === 'manager-edit') {
    const flags = flagsFrom(rest, ['--instructions', '--expected-instructions'])
    const instructions = flags.get('--instructions'); const expected = flags.get('--expected-instructions')
    if (instructions === undefined || expected === undefined) throw new Error('Supply --instructions and --expected-instructions, including empty text to clear.')
    return json(await runtime.manager.editInstructions(instructions, expected))
  }
  if (domain === 'settings' && command === 'schema' && (rest.length === 0 || rest.length === 1 && rest[0] === '--json')) return json({ ...AGENT_SETTINGS_SCHEMA, target, authority })
  if (domain === 'settings') return settingsCommand(args.slice(1), getSettings, setSettings)
  if (domain === 'providers') {
    if (command === 'models' || command === 'account') {
      const flags = flagsFrom(rest, ['--provider'])
      const provider = requestedProvider(required(flags, '--provider'))
      if (provider === undefined || !getSettings().chatProviders.includes(provider)) throw new Error('Select an enabled provider from providers list.')
      return json(command === 'models' ? await runtime.sessions.models(undefined, provider) ?? [] : await runtime.sessions.account(provider))
    }
    const api = application(runtime)
    if (command === 'failures' && rest.length === 0) return json(api['chat:providerPluginFailures']())
    if (command === 'check-updates' && rest.length === 0) return json(await api['chat:checkProviderUpdates']())
    if (command === 'install') return json(await api['chat:installProvider'](required(flagsFrom(rest, ['--url']), '--url'), false))
    if (['reinstall', 'uninstall', 'update'].includes(command ?? '')) {
      const id = required(flagsFrom(rest, ['--id']), '--id')
      const plugin = getSettings().providerPlugins.find((one) => one.id === id)
      if (plugin !== undefined && runtime.sessions.providerInUse(plugin.family).length > 0) throw new Error('Finish all active, held or queued work before changing this library.')
      if (command === 'uninstall') {
        if (plugin !== undefined) assertProviderUnused(plugin.family, getSettings(), { manager: () => runtime.managerView().config, inUse: (provider) => runtime.sessions.providerInUse(provider) })
        if (plugin !== undefined && getSettings().chatProviders.includes(plugin.family)) throw new Error('Disable this provider explicitly before uninstalling. No fallback provider will be enabled.')
        return json(await api['chat:uninstallProvider'](id, true))
      }
      return json(command === 'reinstall' ? await api['chat:reinstallProvider'](id, false) : await api['chat:applyProviderUpdate'](id))
    }
    const manager = await runtime.manager.view()
    return providerSettings(args.slice(1), { read: getSettings, save: setSettings, manager: () => manager.config, inUse: (provider) => runtime.sessions.providerInUse(provider) })
  }
  if (domain === 'projects') {
    if (command === 'list' && rest.length === 0) return json(getSettings().projects)
    if (command === 'add' || command === 'create') {
      const root = required(flagsFrom(rest, ['--path']), '--path')
      if (!isAbsolute(root)) throw new Error('Choose an absolute folder on this target.')
      if (command === 'create') await mkdir(root)
      if (!(await stat(root)).isDirectory()) throw new Error('Choose an absolute existing folder on this target.')
      rememberProject(root)
      return json({ saved: true, projects: getSettings().projects })
    }
    if (command === 'provider') {
      const flags = flagsFrom(rest, ['--project', '--provider', '--expected'])
      const root = required(flags, '--project')
      if (!getSettings().projects.includes(root)) throw new Error('Choose an exact registered project root.')
      const current = getSettings().projectAssistants.find((one) => one.root === root)?.provider ?? null
      if (!flags.has('--provider')) return json({ root, provider: current })
      if (JSON.stringify(current) !== required(flags, '--expected')) throw new Error('Project provider changed. Read projects provider and merge before retrying.')
      const named = required(flags, '--provider')
      const provider = named === 'none' ? undefined : requestedProvider(named)
      if (named !== 'none' && provider === undefined) throw new Error('Select an enabled provider or none.')
      if (provider !== undefined) managerProvider(getSettings(), root, provider)
      setSettings({ projectAssistants: [...getSettings().projectAssistants.filter((one) => one.root !== root), ...(provider === undefined ? [] : [{ root, provider }])] })
      return json({ saved: true, root, provider: provider ?? null })
    }
    if (command === 'remove') {
      const root = required(flagsFrom(rest, ['--project']), '--project')
      if (!getSettings().projects.includes(root)) throw new Error('Choose an exact registered project root from projects list.')
      if (runtime.sessions.hasPendingWork()) throw new Error('Finish or stop pending work before removing a project.')
      forgetProject(root)
      return json({ saved: true, filesKept: true, projects: getSettings().projects })
    }
  }
  const api = application(runtime)
  if (domain === 'speech' && rest.length === 0) {
    if (command === 'status') return json(api['speech:model']())
    if (command === 'fetch') return json(await api['speech:fetch']())
  }
  if (domain === 'browser-config') {
    if (command === 'status' && rest.length === 0) return json(api['browser:state']())
    if (command === 'fetch-model' && rest.length === 0) {
      const state = api['browser:state']()
      if (!getSettings().chromeBridge || !state.supported || !state.modelServer) throw new Error('Browser model download is unavailable on this target. Enable its supported Chrome bridge explicitly first.')
      api['browser:fetchModel']()
      return json({ requested: true, state: api['browser:state']() })
    }
    if (command === 'delete-model' && rest.length === 0) {
      if (getSettings().chromeBridge) throw new Error('Disable Chrome through GeckIt explicitly before deleting its model.')
      await api['browser:deleteModel']()
      return json(api['browser:state']())
    }
    if (command === 'start-test' || command === 'delete-test') {
      const name = required(flagsFrom(rest, ['--name']), '--name')
      if (command === 'start-test') {
        if (!getSettings().chromeBridge || !api['browser:state']().supported) throw new Error('Chrome through GeckIt is unavailable on this target.')
        await api['browser:openTest'](name)
      } else await api['browser:deleteTest'](name)
      return json(api['browser:state']())
    }
  }
  if (domain === 'shortcuts') return productShortcuts(api, args.slice(1))
  if (domain === 'sessions') return productSessions(api, args.slice(1), authority)
  if (domain === 'hosts') {
    if (command === 'list' && rest.length === 0) return json(api['hosts:list']())
    if (command === 'known' && rest.length === 0) return json(api['hosts:known']())
    if (command === 'add' || command === 'edit') {
      const flags = flagsFrom(rest, command === 'add' ? ['--draft'] : ['--id', '--draft', '--expected'])
      const draft = jsonInput(required(flags, '--draft'))
      onlyFields(draft, ['name', 'address', 'user', 'port', 'auth', 'keyFile'])
      if (typeof draft.name !== 'string' || typeof draft.address !== 'string' || typeof draft.user !== 'string' || typeof draft.port !== 'number' || !Number.isInteger(draft.port) || !['key', 'password'].includes(String(draft.auth)) || draft.keyFile !== undefined && typeof draft.keyFile !== 'string') throw new Error('Host draft needs name, address, user, port, auth (key|password), optional keyFile. Passwords use native prompts.')
      const checked: HostDraft = { name: draft.name, address: draft.address, user: draft.user, port: draft.port, auth: draft.auth as HostDraft['auth'], ...(typeof draft.keyFile === 'string' ? { keyFile: draft.keyFile } : {}) }
      if (command === 'add') return json(await api['hosts:check'](checked))
      const id = required(flags, '--id')
      const host = getSettings().hosts.find((one) => one.id === id)
      if (host === undefined) throw new Error('Unknown SSH host ID.')
      if (runtime.sessions.ids((root) => root.startsWith(`ssh://${id}/`)).some((one) => runtime.sessions.busy(one))) throw new Error('Finish SSH work before changing its connection.')
      expectedValues(host, required(flags, '--expected'), ['name', 'address', 'user', 'port', 'auth', 'keyFile'])
      return json(await api['hosts:update'](id, checked))
    }
    const flags = flagsFrom(rest, ['folders', 'add-folder'].includes(command ?? '') ? ['--id', '--path'] : ['--id'])
    const id = required(flags, '--id')
    if (!getSettings().hosts.some((one) => one.id === id)) throw new Error('Choose a registered SSH host ID from hosts list.')
    if (command === 'remove') {
      if (runtime.sessions.ids((root) => root.startsWith(`ssh://${id}/`)).some((one) => runtime.sessions.busy(one))) throw new Error('Finish SSH work before removing its host.')
      return json(await api['hosts:remove'](id))
    }
    if (command === 'forget') return json(api['hosts:forget'](id))
    if (command === 'running') return json(api['hosts:running'](id))
    if (command === 'working') return json(api['hosts:working'](id))
    if (command === 'conversations') return json(api['hosts:conversations'](id))
    if (command === 'install') return json(await api['hosts:install'](id))
    if (command === 'connect') return json(await api['hosts:connect'](id))
    if (command === 'reconnect') return json(await api['hosts:reconnect'](id))
    if (command === 'disconnect') return json(api['hosts:disconnect'](id))
    if (command === 'folders') return json(await api['hosts:folders'](id, flags.get('--path')))
    if (command === 'add-folder') return json(await api['hosts:addFolder'](id, required(flags, '--path')))
  }
  if (domain === 'employees') {
    if (command === 'retry-instructions' && rest.length === 0) return json(await runtime.employees.retryInstructions())
    if (command === 'rename') {
      const flags = flagsFrom(rest, ['--id', '--name', '--expected-name'])
      return json(await runtime.employees.rename(required(flags, '--id'), required(flags, '--name'), flags.get('--expected-name') ?? (() => { throw new Error('Missing --expected-name.') })(), () => true))
    }
    return runtime.employees.command(args.slice(1), undefined, authority === 'manager')
  }
  if (domain === 'channels') {
    if (command === 'list' && rest.length === 0) return json({ ...api['channels:view'](), settings: getSettings().channels.map(({ info, config, ...setting }) => ({ ...setting, info, config: Object.fromEntries(Object.entries(config).filter(([key]) => info.fields.some((field) => field.key === key && field.type !== 'secret'))) })) })
    if (command === 'check-updates' && rest.length === 0) return json(await api['channels:checkUpdates']())
    if (command === 'install') return json(await api['channels:install'](required(flagsFrom(rest, ['--url']), '--url')))
    const flags = flagsFrom(rest, command === 'configure' ? ['--id', '--patch', '--expected'] : ['--id'])
    const id = required(flags, '--id')
    if (!channelId(id)) throw new Error('Choose a channel ID from channels list.')
    const current = getSettings().channels.find((one) => one.info.id === id)
    if (current === undefined) throw new Error('Channel is not installed.')
    if (command === 'remove') return json(await api['channels:remove'](id))
    if (command === 'configure') {
      const patch = jsonInput(required(flags, '--patch'))
      onlyFields(patch, ['enabled', 'projects', 'manager', 'config'])
      if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean' || patch.manager !== undefined && typeof patch.manager !== 'boolean' || patch.projects !== undefined && (!stringList(patch.projects) || !patch.projects.every((root) => getSettings().projects.includes(root)))) throw new Error('Use boolean enabled/manager and registered project roots.')
      if (patch.config !== undefined) {
        const config = jsonInput(JSON.stringify(patch.config))
        for (const [key, value] of Object.entries(config)) {
          const field = current.info.fields.find((one) => one.key === key)
          if (field === undefined || field.type === 'secret' || (field.type === 'text' ? typeof value !== 'string' : field.type === 'boolean' ? typeof value !== 'boolean' : !stringList(value))) throw new Error('Invalid channel configuration. Secrets require the native channel setup.')
        }
      }
      expectedValues(current, required(flags, '--expected'), ['enabled', 'projects', 'manager', 'config'])
      return json(await api['channels:configure'](id, patch as ChannelChange))
    }
  }
  if (domain === 'manager' && command === 'inspect') return json(await api['manager:inspect'](required(flagsFrom(rest, ['--id']), '--id')))
  if (domain === 'manager' && command === 'receipt') return json(api['manager:receipt'](required(flagsFrom(rest, ['--id']), '--id')))
  if (domain === 'manager' && command === 'voice-memos' && rest.length === 0) return json(await api['manager:voice-memos']())
  if (domain === 'manager' && command === 'history') {
    const flags = flagsFrom(rest, ['--thread', '--session', '--revision', '--action'])
    const action = required(flags, '--action')
    if (action !== 'clear' && action !== 'delete') throw new Error('Choose clear or delete.')
    return json(await api['manager:history']({ id: required(flags, '--thread'), action, ...(flags.has('--session') ? { session: required(flags, '--session') } : {}), ...(flags.has('--revision') ? { historyRevision: required(flags, '--revision') } : {}) }))
  }
  if (domain === 'manager' && command === 'configure') {
    const flags = flagsFrom(rest, ['--patch', '--expected'])
    const patch = jsonInput(required(flags, '--patch'))
    onlyFields(patch, ['enabled', 'provider', 'chatModel', 'delegation', 'intake'])
    const intake = patch.intake === undefined ? undefined : intakeInput(patch.intake)
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean' || patch.chatModel !== undefined && typeof patch.chatModel !== 'string' || patch.delegation !== undefined && !['automatic', 'approve'].includes(String(patch.delegation)) || patch.provider !== undefined && (typeof patch.provider !== 'string' || !getSettings().chatProviders.some((one) => one === requestedProvider(String(patch.provider))))) throw new Error('Invalid Manager configuration. Use settings manager-edit for instructions; run capabilities.')
    expectedValues((await runtime.manager.view()).config, required(flags, '--expected'), ['enabled', 'provider', 'chatModel', 'delegation', 'intake'])
    return json(await api['manager:configure']({ ...patch, ...(intake === undefined ? {} : { intake }) } as Partial<ManagerConfig>))
  }
  if (domain === 'manager' && rest.length === 0) {
    if (command === 'view') return json(await api['manager:view']())
    if (command === 'pause') return json(await api['manager:pause']())
    if (command === 'resume') return json(await api['manager:resume']())
    if (command === 'retry') return json(await api['manager:retry']())
    if (command === 'restart') return json(await api['manager:restart']())
  }
  if (domain === 'manager' && command === 'send') return json(await api['manager:send'](required(flagsFrom(rest, ['--text']), '--text')))
  throw new Error('Unsupported product command. Run capabilities on this target.')
}
