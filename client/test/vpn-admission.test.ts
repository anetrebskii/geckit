import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { VpnAdmission } from '../src/main/vpn/admission'
import { VPN_REQUIRED_MESSAGE } from '../src/shared/vpn'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { SessionsDeps } from '../src/main/sessions'
import type { Driver } from '../src/main/sessions/heard'
import { admittedProvider } from '../src/main/sessions/admitted-provider'
import { llmProvider } from '../src/main/sessions/provider'
import { CodexRpc } from '../src/main/sessions/codex-rpc'
import { codexOptions } from '../src/main/sessions/codex-protocol'

class RpcChild extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly sent: string[] = []
  constructor() {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      this.sent.push(text)
      const id = /"id":(\d+)/.exec(text)?.[1]
      if (id !== undefined) queueMicrotask(() => this.stdout.write(`${JSON.stringify({ id: Number(id), result: { userAgent: 'fixture' } })}\n`))
    })
  }
  kill(): boolean { this.emit('close', 0); return true }
}

const made: Sessions[] = []
afterEach(() => { for (const session of made.splice(0)) session.dispose() })

function build(policy: VpnAdmission, extra: Partial<SessionsDeps> = {}) {
  const sent = vi.fn<Driver['send']>()
  const stopped = vi.fn<Driver['stop']>()
  const ended = vi.fn<Driver['end']>().mockResolvedValue(undefined)
  const account = vi.fn<NonNullable<SessionsDeps['claudeAccount']>>().mockResolvedValue({ here: true, signedIn: true, plan: 'Max' })
  const models = vi.fn<NonNullable<SessionsDeps['claudeModels']>>().mockResolvedValue(undefined)
  const program = vi.fn<NonNullable<SessionsDeps['claudeProgram']>>().mockResolvedValue(undefined)
  const usage = vi.fn<NonNullable<SessionsDeps['usage']>>().mockResolvedValue({ windows: new Map() })
  const hold = vi.fn<NonNullable<SessionsDeps['claude']>>().mockImplementation(() => ({ send: sent, answer: () => undefined, stop: stopped, end: ended }))
  const notes = memoryNotes()
  const deps: SessionsDeps = { notes, admit: policy.assert, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, claude: hold, claudeAccount: account, claudeModels: models, claudeProgram: program, usage, disk: { list: async () => [], read: async () => undefined, has: async () => false }, ...extra }
  const sessions = new Sessions(deps)
  made.push(sessions)
  return { sessions, notes, deps, hold, sent, stopped, ended, account, models, program, usage }
}

describe('required VPN admission', () => {
  it('checks every Codex RPC dispatch after initialization, while still allowing cancellation', async () => {
    const policy = new VpnAdmission()
    policy.update({ required: false })
    const child = new RpcChild()
    const rpc = new CodexRpc(() => child, () => undefined, () => undefined, policy.assert)
    await rpc.ready
    const before = child.sent.length
    policy.update({ required: true })
    await expect(rpc.request('thread/start', codexOptions('/work', 'auto'))).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    expect(child.sent).toHaveLength(before)
    await rpc.request('thread/unsubscribe', { threadId: 'owned-thread' })
    expect(child.sent).toHaveLength(before + 1)
    rpc.dispose()
  })
  it('fails closed before initialization and blocks local and SSH starts without provider calls', async () => {
    const policy = new VpnAdmission()
    const fake = build(policy)
    for (const root of ['/work', 'ssh://host/work']) await expect(fake.sessions.send({ root, mode: 'auto', text: 'Start' })).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await expect(fake.sessions.account()).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await expect(fake.sessions.models('/work')).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await expect(fake.sessions.measure()).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await expect(fake.sessions.codexBrowsers()).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    expect(fake.hold).not.toHaveBeenCalled()
    expect(fake.account).not.toHaveBeenCalled()
    expect(fake.models).not.toHaveBeenCalled()
    expect(fake.program).not.toHaveBeenCalled()
    expect(fake.usage).not.toHaveBeenCalled()
  })

  it('keeps interrupted local and SSH recovery metadata intact when resume admission is denied', async () => {
    const policy = new VpnAdmission()
    const fake = build(policy)
    const cut = { root: 'ssh://host/work', at: 123 }
    fake.notes.set('held-session', { title: 'Interrupted', cut })
    await expect(fake.sessions.proceed('held-session')).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await expect(fake.sessions.reattach([{ id: 'held-session', root: cut.root }])).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    expect(fake.notes.all()['held-session']?.cut).toEqual(cut)
    expect(fake.hold).not.toHaveBeenCalled()
  })

  it('retains a handoff request when admission changes during its answer and allows it to be answered later', async () => {
    const policy = new VpnAdmission()
    policy.update({ required: false })
    let delayed = false
    let finish: (value: Awaited<ReturnType<NonNullable<SessionsDeps['claudeAccount']>>>) => void = () => undefined
    const pending = new Promise<Awaited<ReturnType<NonNullable<SessionsDeps['claudeAccount']>>>>((done) => { finish = done })
    const account = vi.fn<NonNullable<SessionsDeps['claudeAccount']>>().mockImplementation(() => delayed ? pending : Promise.resolve({ here: true, signedIn: true, plan: 'Max' }))
    const shown: Parameters<SessionsDeps['items']>[0][] = []
    const fake = build(policy, { claudeAccount: account, items: (items) => { shown.push(items) } })
    const parent = await fake.sessions.send({ root: '/work', mode: 'auto', text: 'Parent' })
    const waiting = fake.sessions.request(parent, [{ root: '/work', project: 'Work', title: 'Child', text: 'Child task' }], 'auto', new AbortController().signal)
    const request = shown.flatMap((items) => items.items).find((item) => item.kind === 'request')
    if (request === undefined) throw new Error('Missing handoff request')
    delayed = true
    const answering = fake.sessions.answerRequest(request.id, { start: [true], notes: [], where: 'mac' })
    const denied = expect(answering).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    await vi.waitFor(() => expect(account).toHaveBeenCalledTimes(2))
    policy.update({ required: true })
    finish({ here: true, signedIn: true, plan: 'Max' })
    await denied
    expect(fake.sent).toHaveBeenCalledOnce()
    expect((await fake.sessions.items(parent)).find((item) => item.id === request.id)).toMatchObject({ kind: 'request', tasks: [{ title: 'Child' }] })
    policy.update({ required: false })
    await fake.sessions.answerRequest(request.id, { start: [false], notes: [], where: 'mac' })
    expect((await waiting)?.tasks).toEqual([{ answer: 'refused' }])
  })

  it('retains queued messages through restart, dispatch and delegation denial, then admits unchanged work after release', async () => {
    const policy = new VpnAdmission()
    const fake = build(policy)
    const message = { session: 'queued-session', root: '/work', mode: 'auto', text: 'Keep every word' } as const
    fake.notes.set('queued-session', { unborn: '/work', queued: [{ id: 'queued:one', at: 1, message }] })
    const restarted = new Sessions({ ...fake.deps, notes: fake.notes })
    made.push(restarted)
    await restarted.resumeQueues()
    restarted.carryOn('queued-session')
    await expect(restarted.delegate('queued-session', 'queued:one')).rejects.toThrow(VPN_REQUIRED_MESSAGE)
    expect(fake.notes.all()['queued-session']?.queued?.[0]?.message).toEqual(message)
    expect(fake.hold).not.toHaveBeenCalled()
    policy.update({ required: false })
    restarted.carryOn('queued-session')
    await vi.waitFor(() => expect(fake.sent).toHaveBeenCalledWith(message.text, undefined, []))
    await vi.waitFor(() => expect(fake.notes.all()['queued-session']?.queued).toBeUndefined())
  })

  it('rechecks after asynchronous account work and retains a queued dispatch if policy changes', async () => {
    const policy = new VpnAdmission()
    policy.update({ required: false })
    let finish: (value: Awaited<ReturnType<NonNullable<SessionsDeps['claudeAccount']>>>) => void = () => undefined
    const pending = new Promise<Awaited<ReturnType<NonNullable<SessionsDeps['claudeAccount']>>>>((done) => { finish = done })
    const account = vi.fn<NonNullable<SessionsDeps['claudeAccount']>>().mockReturnValue(pending)
    const notes = memoryNotes()
    const message = { session: 'queued-session', root: '/work', mode: 'auto', text: 'Retain me' } as const
    notes.set('queued-session', { unborn: '/work', queued: [{ id: 'queued:one', at: 1, message }] })
    const fake = build(policy, { notes, claudeAccount: account })
    fake.sessions.carryOn('queued-session')
    await vi.waitFor(() => expect(account).toHaveBeenCalled())
    expect(policy.update({ required: true })).toBe(true)
    finish({ here: true, signedIn: true, plan: 'Max' })
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.hold).not.toHaveBeenCalled()
    expect(fake.sent).not.toHaveBeenCalled()
    expect(notes.all()['queued-session']?.queued?.[0]?.message).toEqual(message)
  })

  it('cancels owned active drivers without removing queues and allows a fresh ordinary request after release', async () => {
    const policy = new VpnAdmission()
    policy.update({ required: false })
    const fake = build(policy)
    const id = await fake.sessions.send({ root: '/work', mode: 'auto', text: 'First' })
    await fake.sessions.send({ session: id, root: '/work', mode: 'auto', text: 'Queued' })
    const before = fake.notes.all()[id]?.queued
    policy.update({ required: true })
    fake.sessions.blockForVpn()
    expect(fake.stopped).toHaveBeenCalledOnce()
    expect(fake.ended).toHaveBeenCalledOnce()
    expect(fake.notes.all()[id]?.queued).toEqual(before)
    policy.update({ required: false })
    await fake.sessions.send({ root: '/work', mode: 'auto', text: 'Normal again' })
    expect(fake.hold).toHaveBeenCalledTimes(2)
  })

  it('guards plugin correction/control methods while leaving builtin disk reads available', async () => {
    const policy = new VpnAdmission()
    const correct = vi.fn().mockResolvedValue({ ok: true, text: 'Corrected' })
    const read = vi.fn().mockResolvedValue(undefined)
    const base = llmProvider({ correct, disk: { list: async () => [], read, has: async () => false } }, 'claude')
    const builtin = admittedProvider(base, policy.assert)
    expect(await builtin.read('/work', 'one')).toBeUndefined()
    expect(read).toHaveBeenCalledOnce()
    const plugin = admittedProvider(base, policy.assert, true)
    expect(() => plugin.correct('text', 'instruction', '')).toThrow(VPN_REQUIRED_MESSAGE)
    expect(() => plugin.read('/work', 'one')).toThrow(VPN_REQUIRED_MESSAGE)
    expect(() => plugin.create({ root: '/work', mode: 'auto' })).toThrow(VPN_REQUIRED_MESSAGE)
    expect(correct).not.toHaveBeenCalled()
    policy.update({ required: false })
    expect(await plugin.correct('text', 'instruction', '')).toEqual({ ok: true, text: 'Corrected' })
  })
})
