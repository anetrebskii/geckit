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

  it('keeps page selections independent for clients of the same server', () => {
    const one = clientOwn('desktop:one:server:a:own')
    const other = clientOwn('desktop:two:server:a:own')
    const shared = { ...server, chatPlace: 'settings' }
    expect(one.own(shared).chatPlace).toBe('tasks')
    expect(one.take({ chatPlace: 'manager' })).toEqual({ here: { chatPlace: 'manager' }, there: {} })
    expect(other.own(shared).chatPlace).toBe('tasks')
    other.take({ chatPlace: 'team' })
    expect(other.own(shared).chatPlace).toBe('team')
    expect(one.own({ ...shared, chatPlace: 'browsers' }).chatPlace).toBe('manager')
    expect(clientOwn('desktop:one:server:a:own').own(shared).chatPlace).toBe('manager')
    expect(clientOwn('desktop:one:server:b:own').own(shared).chatPlace).toBe('tasks')
  })

  it('is counted under an id of its own, made the first time and forgotten when counting is turned off', () => {
    const one = clientOwn('server:a:own')
    const first = one.client()
    expect(first).not.toBe('')
    expect(one.client()).toBe(first)
    one.take({ analytics: false })
    expect(one.client()).not.toBe(first)
  })

  it('asks about counting and errors once per device, whichever server it opens', () => {
    clientOwn('server:a:own').take({ analytics: false, analyticsAsked: true, sendErrors: true, theme: 'light' })
    const other = clientOwn('server:b:own').own(server)
    expect([other.analytics, other.analyticsAsked, other.sendErrors, other.theme]).toEqual([false, true, true, 'dark'])
  })

  it('moves an answer kept for one server to the device', () => {
    localStorage.setItem('server:a:own', JSON.stringify({ analytics: true, analyticsAsked: true, theme: 'light' }))
    clientOwn('server:a:own')
    expect(clientOwn('server:b:own').own(server)).toMatchObject({ analytics: true, analyticsAsked: true, theme: 'dark' })
  })
})
