import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Link } from '../src/renderer/src/link'
import type { LinkMessage } from '../src/shared/pairing'
import type { AgentVpnView } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { installGeckit as InstallGeckit } from '../src/renderer/src/phone'
import { phoneCalls } from '../src/renderer/src/phone-calls'

const view: AgentVpnView = { servers: [{ id: 'one', name: 'Amsterdam', version: 'AmneziaWG 3' }], selected: 'one', runtime: 'unavailable', required: true, blocked: true, secureStorage: true }
type Call = Extract<LinkMessage, { t: 'call' }>

function host() {
  const calls: Call[] = []
  const heard: Parameters<Link['onMessage']>[0][] = []
  const closed: Parameters<Link['onClose']>[0][] = []
  const emit = (message: LinkMessage): void => { for (const hear of heard) hear(message) }
  let failSend = false
  const link: Link = {
    send: (message) => {
      if (message.t !== 'call') return
      calls.push(message)
      if (message.name === 'agentVpn.view') { if (failSend) throw new Error('Closed'); return }
      void Promise.resolve().then(() => emit({ t: 'reply', id: message.id, value: message.name === 'settings.get' ? DEFAULT_SETTINGS : message.name === 'chat.list' ? [] : null }))
    },
    onMessage: (hear) => { heard.push(hear) },
    onClose: (close) => { closed.push(close) },
    close: () => { for (const close of closed) close() },
    screen: () => undefined,
    share: () => Promise.resolve(),
    compress: () => undefined,
  }
  return { link, calls, emit, fail: () => { failSend = true } }
}

describe('read-only phone VPN bridge', () => {
  let installGeckit: typeof InstallGeckit
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('document', { querySelector: () => null })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    installGeckit = (await import('../src/renderer/src/phone')).installGeckit
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('forwards only the metadata read and changed event; mutations stay on the computer', async () => {
    const computer = host()
    installGeckit(computer.link, { home: '/Users/a', platform: 'darwin' }, 'mac')
    const reading = window.geckit.agentVpn.view()
    const call = computer.calls.find((one) => one.name === 'agentVpn.view')
    expect(call?.args).toEqual([])
    if (call === undefined) throw new Error('Missing VPN read')
    computer.emit({ t: 'reply', id: call.id, value: view })
    expect(await reading).toEqual(view)
    const heard: AgentVpnView[] = []
    const off = window.geckit.agentVpn.onView((next) => heard.push(next))
    computer.emit({ t: 'tell', channel: 'vpn:changed', value: view })
    expect(heard).toEqual([view])
    off()
    computer.emit({ t: 'tell', channel: 'vpn:changed', value: view })
    expect(heard).toHaveLength(1)
    for (const mutation of [window.geckit.agentVpn.import(), window.geckit.agentVpn.select('one'), window.geckit.agentVpn.rename('one', 'New'), window.geckit.agentVpn.remove('one'), window.geckit.agentVpn.check('one')]) await expect(mutation).rejects.toThrow('Configure Agent VPN on the computer.')
    expect(computer.calls.filter((one) => one.name.startsWith('agentVpn.')).map((one) => one.name)).toEqual(['agentVpn.view'])
  })

  it('invalidates immediately on loss, rejects offline reads without holding them, and ignores old-link traffic', async () => {
    const old = host()
    const installed = installGeckit(old.link, { home: '/Users/a', platform: 'darwin' }, 'mac')
    const connection: boolean[] = []
    const stop = phoneCalls()?.onConnection((up) => connection.push(up))
    const reading = window.geckit.agentVpn.view()
    const rejected = expect(reading).rejects.toThrow('The link to the host is down')
    old.link.close()
    expect(connection).toEqual([false])
    expect(phoneCalls()?.connected()).toBe(false)
    await rejected
    await expect(window.geckit.agentVpn.view()).rejects.toThrow('The link to the host is down')
    const seen: AgentVpnView[] = []
    window.geckit.agentVpn.onView((next) => seen.push(next))
    old.emit({ t: 'tell', channel: 'vpn:changed', value: view })
    expect(seen).toEqual([])
    const next = host()
    installed.swap(next.link)
    expect(connection).toEqual([false, true])
    expect(next.calls.some((one) => one.name === 'agentVpn.view')).toBe(false)
    const fresh = window.geckit.agentVpn.view()
    const call = next.calls.find((one) => one.name === 'agentVpn.view')
    if (call === undefined) throw new Error('Missing VPN read')
    old.emit({ t: 'reply', id: call.id, value: { ...view, selected: null } })
    old.emit({ t: 'tell', channel: 'vpn:changed', value: view })
    next.emit({ t: 'reply', id: call.id, value: view })
    expect(await fresh).toEqual(view)
    expect(seen).toEqual([])
    next.emit({ t: 'tell', channel: 'vpn:changed', value: view })
    expect(seen).toEqual([view])
    stop?.()
    next.link.close()
    expect(connection).toEqual([false, true])
  })

  it('reports a link closing during send immediately and preserves older-host read errors', async () => {
    const computer = host()
    installGeckit(computer.link, { home: '/Users/a', platform: 'darwin' }, 'mac')
    const reading = window.geckit.agentVpn.view()
    const call = computer.calls.find((one) => one.name === 'agentVpn.view')
    if (call === undefined) throw new Error('Missing VPN read')
    computer.emit({ t: 'reply', id: call.id, error: 'No such call: agentVpn.view' })
    await expect(reading).rejects.toThrow('No such call')
    const connection: boolean[] = []
    phoneCalls()?.onConnection((up) => connection.push(up))
    computer.fail()
    await expect(window.geckit.agentVpn.view()).rejects.toThrow('The link to the host is down')
    expect(connection).toEqual([false])
  })
})
