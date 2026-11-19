import { savedServers } from '../../client/src/renderer/src/remote/storage'
import { roomOf, SIGNAL } from '../../client/src/shared/pairing'
import type { RemoteServer } from '../../client/src/shared/remote/protocol'

interface Selection {
  readonly server: RemoteServer['id'] | null
  readonly revision: number
}

const STORAGE = 'geckit-push-selection'
function savedSelection(): Selection | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Selection | null
  } catch {
    return null
  }
}

let selection = savedSelection()
let token: string | undefined
let sent: Selection | undefined
let sending: Selection | undefined
let retry: ReturnType<typeof setTimeout> | undefined

export async function syncPushRoute(): Promise<void> {
  const current = selection
  const destination = token
  if (current === null || destination === undefined || current === sent || current === sending) return
  clearTimeout(retry)
  sending = current
  const stillSelected = (): boolean => current === selection && destination === token
  const request = new AbortController()
  const timeout = setTimeout(() => request.abort(), 15_000)
  try {
    const server = current.server === null ? undefined : (await savedServers()).find((one) => one.server.id === current.server)
    const room = server === undefined ? null : await roomOf(server.key)
    if (!stillSelected()) return
    const response = await fetch(`${SIGNAL}/pushRoute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: destination, room, revision: current.revision }),
      signal: request.signal,
    })
    if (!stillSelected()) return
    if (response.ok) sent = current
    else if (response.status >= 500) retry = setTimeout(() => void syncPushRoute(), 5000)
  } catch {
    if (stillSelected()) retry = setTimeout(() => void syncPushRoute(), 5000)
  } finally {
    clearTimeout(timeout)
    if (stillSelected()) sending = undefined
  }
}

export function setPushRouteToken(value: string): void {
  const normalized = value.toLowerCase()
  if (token !== normalized) {
    token = normalized
    sent = undefined
    sending = undefined
  }
  void syncPushRoute()
}

export function selectPushComputer(server: Selection['server']): Promise<void> {
  selection = { server, revision: Math.max(Date.now(), (selection?.revision ?? 0) + 1) }
  localStorage.setItem(STORAGE, JSON.stringify(selection))
  return syncPushRoute()
}

export function forgetPushComputer(id: RemoteServer['id']): void {
  if (selection?.server === id) void selectPushComputer(null)
}
