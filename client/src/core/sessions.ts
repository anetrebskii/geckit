import { stat } from 'node:fs/promises'

import { assistantsIn } from '../shared/api'
import type { SessionProvider } from '../shared/api'
import { independentProviderInfo, registerProviderInfo } from '../shared/providers'
import { isRemote } from '../shared/hosts'
import { Sessions } from '../main/sessions'
import type { SessionsDeps } from '../main/sessions'
import { CodexSessions } from '../main/sessions/codex'
import { claudeFile, deleteClaude, everyClaude, forkPoint, listClaude, readClaudeSession, readGoal, readLinks } from '../main/sessions/disk'
import { installedPlugins } from '../main/sessions/plugins'
import { readMcp } from '../main/sessions/mcp'
import { readBrowsers } from '../main/sessions/chrome'
import { claudeModels } from '../main/sessions/models'
import { searchClaude } from '../main/sessions/search'
import { foldersFor, hostIsDir, hostMcp, hostModels, hostTaskOutput, routedClaude, routedShell } from '../main/hosts/route'
import type { Routes } from '../main/hosts/route'
import { getSettings, setSettings } from '../main/store'
import { keepCommands } from '../main/commands'
import { checkVpnIp } from '../main/vpn-ip'

function routedDisk(held: Routes): NonNullable<ConstructorParameters<typeof Sessions>[0]['disk']> {
  const local = {
    list: listClaude,
    read: readClaudeSession,
    has: async (root: string, id: string) => (await claudeFile(root, id)) !== undefined,
    delete: deleteClaude,
    goal: readGoal,
    forkPoint,
    links: readLinks,
  }
  return {
    list: (root) => (isRemote(root) ? held.disk.list(root) : local.list(root)),
    read: (root, id) => (isRemote(root) ? held.disk.read(root, id) : local.read(root, id)),
    has: (root, id) => (isRemote(root) ? held.disk.has(root, id) : local.has(root, id)),
    delete: (root, id) => (isRemote(root) ? held.disk.delete(root, id) : local.delete(root, id)),
    goal: (root, id) => (isRemote(root) ? held.disk.goal(root, id) : local.goal(root, id)),
    forkPoint: (root, id, at) => (isRemote(root) ? held.disk.forkPoint(root, id, at) : local.forkPoint(root, id, at)),
    links: (root, id) => (isRemote(root) ? held.disk.links(root, id) : local.links(root, id)),
    // Hidden conversations looks everywhere at once: this computer's own folder, and every host's mirror.
    every: async (from, to, wanted) => [...(await everyClaude(from, to, wanted)), ...(await held.disk.every(from, to, wanted))],
  }
}


export async function createCoreSessions(held: Routes, callbacks: SessionsDeps): Promise<Sessions> {
  const deps: SessionsDeps = {
    ...callbacks,
    codex: callbacks.codex ?? new CodexSessions(undefined, callbacks.account),
    notes: callbacks.notes,
    transport: () => getSettings().chatTransport,
    commands: keepCommands,
    beforeSend: () => getSettings().vpnIpCheck ? checkVpnIp(getSettings) : undefined,
    vpnMonitor: () => getSettings().vpnIpCheck ? JSON.stringify(getSettings().vpnAllowedIps) : undefined,
    claude: routedClaude(held),
    disk: routedDisk(held),
    shell: routedShell(held),
    there: async (path) => !isRemote(path) ? stat(path).then((found) => found.isDirectory(), () => false) : getSettings().projects.includes(path) || hostIsDir(held, path),
    taskOutput: (root, session, task) => isRemote(root) ? hostTaskOutput(held, root, session, task) : Promise.resolve(undefined),
    mcp: (root, change) => isRemote(root) ? hostMcp(held, root, change) : readMcp(root, change),
    browsers: (root, pick) => isRemote(root) ? Promise.resolve(undefined) : readBrowsers(root, pick),
    claudeModels: (root) => root !== undefined && isRemote(root) ? hostModels(held, root) : claudeModels(),
    search: (roots, asked) => searchClaude(roots, asked, (root) => foldersFor(held, root)),
    limit: () => getSettings().workingAtOnce,
    enabled: () => assistantsIn(getSettings()),
    order: () => getSettings().progressOrder,
  }
  const plugins = await installedPlugins()
  registerProviderInfo(plugins.map((one) => one.info))
  const previous = getSettings()
  const available = new Set<SessionProvider>(['claude', 'codex', ...plugins.map((one) => one.info.family)])
  const enabled = [...new Set([
    ...assistantsIn(previous).filter((one) => available.has(one)),
    ...previous.providerPlugins
      .filter((old) => independentProviderInfo(old).family !== old.family)
      .map(independentProviderInfo)
      .filter((one) => plugins.some((plugin) => plugin.info.id === one.id))
      .map((one) => one.family),
  ])]
  if (enabled.length === 0) enabled.push('claude')
  const chatProviders = enabled
  const chatProvider = chatProviders.includes(previous.chatProvider) ? previous.chatProvider : chatProviders[0] ?? 'claude'
  setSettings({
    providerPlugins: plugins.map((one) => one.info),
    providerUpdatesReady: [],
    providerRemovalPending: false,
    chatProviders,
    chatProvider,
    correctProvider: available.has(previous.correctProvider) ? previous.correctProvider : chatProvider,
    chatTransport: 'stream',
  })
  return new Sessions({ ...deps, plugins: plugins.map((one) => one.provider) })
}
