import { Socket, connect } from 'node:net'
import type * as Net from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { askedEndpoint } from '../src/cli/endpoint'
import { manage } from '../src/cli/manage'

vi.mock('node:net', async (original) => ({ ...await original<typeof Net>(), connect: vi.fn() }))

const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
})

describe('Manager command transport', () => {
  it.each(['darwin', 'win32'] as const)('uses the shared application endpoint on %s and preserves authenticated requests', async (platform) => {
    Object.defineProperty(process, 'platform', { value: platform })
    const socket = new Socket()
    vi.mocked(connect).mockReturnValue(socket)
    vi.spyOn(socket, 'setTimeout').mockReturnValue(socket)
    const write = vi.spyOn(socket, 'write').mockReturnValue(true)
    const directory = platform === 'win32' ? 'C:\\Users\\fixture\\AppData\\Roaming\\geckit' : '/fixture/geckit'
    const result = manage(['sessions', 'retry', '--id', 'codex:fixture'], directory, { GECKIT_MANAGER_SESSION: 'manager-fixture', GECKIT_MANAGER_TOKEN: 'fixture-token', GECKIT_MANAGER_OPERATION: 'retry-fixture' })
    expect(connect).toHaveBeenLastCalledWith(askedEndpoint(directory, platform))
    socket.emit('connect')
    expect(write).toHaveBeenCalledWith(`${JSON.stringify({ action: 'manage', args: ['sessions', 'retry', '--id', 'codex:fixture'], session: 'manager-fixture', token: 'fixture-token', operation: 'retry-fixture' })}\n`)
    socket.emit('data', `${JSON.stringify({ ok: true, result: 'blocked by current policy' })}\n`)
    socket.emit('end')
    await expect(result).resolves.toEqual({ ok: true, said: 'blocked by current policy' })
    socket.destroy()
  })
})
