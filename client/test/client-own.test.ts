import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clientOwn } from '../src/shared/client-own'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'

describe('what a client keeps for itself', () => {
  beforeEach(() => {
    const held = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => { held.set(key, value) } })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const server: Settings = { ...DEFAULT_SETTINGS, theme: 'dark', analytics: true, analyticsAsked: true, sendErrors: true, profiles: [{ id: 'f', name: 'Formula', projects: ['/f'] }] }

  it('keeps its own look and consent per server and sends the rest on', () => {
    const one = clientOwn('server:a:own')
    const { here, there } = one.take({ theme: 'light', profile: 'f', projects: ['/p'] })
    expect(here).toEqual({ theme: 'light', profile: 'f' })
    expect(there).toEqual({ projects: ['/p'] })
    const shown = one.own(server)
    expect(shown.theme).toBe('light')
    expect(shown.profile).toBe('f')
    expect([shown.analytics, shown.analyticsAsked, shown.sendErrors]).toEqual([false, false, false])
    expect(clientOwn('server:a:own').own(server).theme).toBe('light')
    expect(clientOwn('server:b:own').own(server).theme).toBe('dark')
  })

  it('shows All projects when the server no longer has the profile', () => {
    const one = clientOwn('server:a:own')
    one.take({ profile: 'gone' })
    expect(one.own(server)).toMatchObject({ profile: '', chatProjects: [], chatAll: true })
  })

  it('is counted under an id of its own, made the first time and forgotten when counting is turned off', () => {
    const one = clientOwn('server:a:own')
    const first = one.client()
    expect(first).not.toBe('')
    expect(one.client()).toBe(first)
    one.take({ analytics: false })
    expect(one.client()).not.toBe(first)
  })
})
