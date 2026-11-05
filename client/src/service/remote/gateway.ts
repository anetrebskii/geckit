import { randomUUID } from 'node:crypto'
import type { CoreRuntime } from '../../core/runtime'
import { getSettings } from '../../main/store'
import { managerProjects } from '../../shared/manager'
import { remoteRef } from '../../shared/remote/protocol'
import type { RemoteHistory, RemoteItem, RemoteServer, RemoteSession, RemoteSnapshot } from '../../shared/remote/protocol'
import type { SessionItem } from '../../shared/api'
import type { ManagerThread, ManagerView } from '../../shared/manager'
const threadsOf = (manager: ManagerView): readonly Pick<ManagerThread, 'session' | 'title' | 'state'>[] => manager.threads ?? (manager.session === undefined ? [] : [{ session: manager.session.id, title: 'Manager', state: manager.session.state === 'working' ? 'working' : 'idle' }])
export type ObservationRuntime = Pick<CoreRuntime, 'subscribe'> & { readonly sessions: Pick<CoreRuntime['sessions'], 'list' | 'items'>; readonly manager: Pick<CoreRuntime['manager'], 'view' | 'inspect'> }
export function observation(runtime: ObservationRuntime, server: RemoteServer) {
  const epoch = randomUUID()
  let seq = 0
  const listeners = new Set<(seq: number) => void>()
  const stop = runtime.subscribe((event) => {
    if (!['chat:sessions', 'chat:items', 'manager:view', 'manager:items', 'settings:changed', 'employees:changed'].includes(event.name)) return
    seq++
    for (const listener of listeners) listener(seq)
  })
  const sessions = async (projects: readonly string[]) => (await runtime.sessions.list(projects)).filter((session) => projects.includes(session.project ?? session.root))
  const summary = (one: Awaited<ReturnType<typeof sessions>>[number]): RemoteSession => ({ id: remoteRef(server.id, 'session', one.id), project: remoteRef(server.id, 'project', one.project ?? one.root), title: one.title, stands: one.stands, state: one.state, at: one.at, ...(one.provider === undefined ? {} : { provider: one.provider }), ...(one.status === undefined ? {} : { status: one.status }) })
  return {
    epoch,
    sequence: () => seq,
    changed: (listener: (seq: number) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    snapshot: async (scope: readonly string[], includeManager = false): Promise<RemoteSnapshot> => {
      const through = seq
      const projects = managerProjects(getSettings()).filter((root) => scope.includes(root))
      const all = await sessions(projects)
      const manager = await runtime.manager.view()
      const hasManager = includeManager && managerProjects(getSettings()).every((root) => scope.includes(root))
      return { server, epoch, seq: through, projects: projects.map((path) => ({ id: remoteRef(server.id, 'project', path), path })), sessions: all.map(summary), manager: { state: manager.state, queued: hasManager ? manager.queued : 0, threads: hasManager ? threadsOf(manager).flatMap((one) => one.session === undefined ? [] : [{ id: remoteRef(server.id, 'manager', one.session), title: one.title, state: one.state }]) : [] } }
    },
    history: async (scope: readonly string[], ref: string, before: number, includeManager = false): Promise<RemoteHistory> => {
      const session = (await sessions(scope.filter((root) => managerProjects(getSettings()).includes(root)))).find((one) => remoteRef(server.id, 'session', one.id) === ref)
      const manager = includeManager && managerProjects(getSettings()).every((root) => scope.includes(root)) ? await runtime.manager.view() : undefined
      const thread = manager === undefined ? undefined : threadsOf(manager).find((one) => one.session !== undefined && remoteRef(server.id, 'manager', one.session) === ref)
      if (session === undefined && thread?.session === undefined) throw new Error('Conversation is outside this device scope.')
      const items = session === undefined ? (await runtime.manager.inspect(thread?.session ?? '')).items : await runtime.sessions.items(session.id)
      const end = before === 0 ? items.length : Math.min(before, items.length)
      const start = Math.max(0, end - 100)
      return { session: ref, items: items.slice(start, end).map((item) => itemFor(server.id, ref, item)), before: start, revision: seq }
    },
    dispose: stop,
  }
}
function itemFor(server: string, session: string, item: SessionItem): RemoteItem {
  const text = 'text' in item ? item.text : item.kind === 'did' ? item.what : item.kind === 'shell' ? `${item.command}\n${item.output}` : item.kind === 'wrote' ? item.paths.join('\n') : item.kind === 'card' ? 'Approval requested (read only)' : item.kind
  return { id: remoteRef(server, 'item', `${session}:${item.id}`), kind: item.kind, text: text.slice(0, 64_000) }
}
