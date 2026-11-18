import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('../package.json')
  vi.doUnmock('../../.version?raw')
  vi.resetModules()
})

it('reports the release tag version when building an unchanged source checkout', async () => {
  vi.doMock('../package.json', () => ({ version: '1.0.0' }))
  vi.doMock('../../.version?raw', () => ({ default: '1.266\n' }))
  expect((await import('../src/shared/version')).version).toBe('1.266.0')
})

it.each(['1.267.0', '1.267.0-beta.2'])('retains a CI-stamped package version %s', async (version) => {
  vi.doMock('../package.json', () => ({ version }))
  vi.doMock('../../.version?raw', () => ({ default: '1.266\n' }))
  expect((await import('../src/shared/version')).version).toBe(version)
})
