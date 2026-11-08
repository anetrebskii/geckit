import { afterEach, expect, it, vi } from 'vitest'
import type { ElectronMainOptions } from '@sentry/electron/main'
import { startErrors } from '../src/main/errors'

const fakes = vi.hoisted(() => ({ init: vi.fn<(options: ElectronMainOptions) => void>() }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.197.0', isPackaged: false } }))
vi.mock('@sentry/electron/main', () => ({ init: fakes.init }))
vi.mock('../src/main/store', () => ({ getSettings: () => ({ sendErrors: false }) }))
afterEach(() => { vi.unstubAllGlobals() })

it('keeps collection disabled and gates error sending with the upgraded SDK', async () => {
  vi.stubGlobal('__SENTRY_DSN__', 'https://public@example.invalid/1')
  startErrors()
  const options = fakes.init.mock.calls[0]?.[0]
  expect(options?.dataCollection).toEqual({
    userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
    graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
    databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0,
  })
  expect(await options?.beforeSend?.({ type: undefined, message: 'held until consent' }, {})).toBeNull()
  const defaults = [{ name: 'Minidump' }, { name: 'Screenshots' }, { name: 'Session' }, { name: 'Error' }]
  expect(typeof options?.integrations === 'function' ? options.integrations(defaults) : undefined).toEqual([{ name: 'Error' }])
})
