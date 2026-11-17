import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CoreMethods } from '../src/core/application'
import type { WorkspaceConnection } from '../src/renderer/src/remote/Workspace'
import type { PhoneCalls } from '../src/renderer/src/phone-calls'
import { workspaceApi } from '../src/renderer/src/remote/workspace-api'
import type { RemoteServer } from '../src/shared/remote/protocol'

const server: RemoteServer = { id: 'remote-version', name: 'Remote server', publicKey: 'key' }
const metadata: Awaited<ReturnType<CoreMethods['service:about']>> = { platform: 'linux', home: '/home/remote', name: 'Remote server', speech: { state: 'absent', received: 0, total: 1 }, version: '1.258.0' }

function connection() {
  const call = vi.fn<(method: keyof CoreMethods) => Promise<Partial<typeof metadata>>>()
  const on = vi.fn<WorkspaceConnection['on']>(() => () => undefined)
  call.mockResolvedValue(metadata)
  const link: WorkspaceConnection = {
    call: async <K extends keyof CoreMethods>(method: K, ..._args: Parameters<CoreMethods[K]>): Promise<Awaited<ReturnType<CoreMethods[K]>>> => await call(method) as Awaited<ReturnType<CoreMethods[K]>>,
    on,
  }
  return { call, link }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('the connected computer version', () => {
  it('reads the remote version when Settings opens and reads it again after a server update', async () => {
    const remote = connection()
    const api = await workspaceApi(remote.link, server, false)
    await expect(api.update.view()).resolves.toMatchObject({ state: 'off', version: '1.258.0', message: 'Update the GeckIt service on the server.' })
    remote.call.mockResolvedValue({ ...metadata, version: '1.261.0' })
    await expect(api.update.view()).resolves.toMatchObject({ state: 'off', version: '1.261.0' })
    expect(remote.call.mock.calls.every(([method]) => method === 'service:about')).toBe(true)
  })

  it('shows the same server version through the phone About boundary', async () => {
    const phoneWindow: { readonly parent: object; geckitPhone?: PhoneCalls } = { parent: {} }
    vi.stubGlobal('window', phoneWindow)
    await workspaceApi(connection().link, server, true)
    await expect(phoneWindow.geckitPhone?.version()).resolves.toBe('1.258.0')
  })

  it('falls back to bootstrap metadata for a server without service:about', async () => {
    const remote = connection()
    remote.call.mockRejectedValueOnce(new Error('Unknown GeckIt method.'))
    await workspaceApi(remote.link, server, false)
    expect(remote.call.mock.calls.map(([method]) => method)).toEqual(['service:about', 'service:bootstrap'])
  })

  it('keeps an unavailable version readable when a connected computer loses its link', async () => {
    const remote = connection()
    const api = await workspaceApi(remote.link, server, false)
    remote.call.mockRejectedValue(new Error('The link to the computer is down. Try again when it is back.'))
    await expect(api.update.view()).resolves.toMatchObject({ state: 'off', version: '' })
  })

  it('keeps missing metadata explicit without substituting the client version', async () => {
    const remote = connection()
    const older: Partial<typeof metadata> = { ...metadata }
    delete older.version
    remote.call.mockResolvedValue(older)
    const phoneWindow: { readonly parent: object; geckitPhone?: PhoneCalls } = { parent: {} }
    vi.stubGlobal('window', phoneWindow)
    const api = await workspaceApi(remote.link, server, true)
    await expect(api.update.view()).resolves.toMatchObject({ state: 'off', version: '' })
    await expect(phoneWindow.geckitPhone?.version()).resolves.toBe('Version unavailable')
  })
})
