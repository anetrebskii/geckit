import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { WebSocketServer } from 'ws'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { memoryNotes, Sessions } from '../src/main/sessions'
import type { Held } from '../src/main/sessions/claude'
import { CodexSessions } from '../src/main/sessions/codex'
import { codexOptions } from '../src/main/sessions/codex-protocol'
import type { CodexEvent, CodexGoal, CodexInput, CodexTurn, Json, RpcId, ThreadOptions } from '../src/main/sessions/codex-protocol'
import { codexEnvironment } from '../src/main/sessions/codex-rpc'
import type { Heard } from '../src/main/sessions/heard'
import type { runShell } from '../src/main/sessions/shell'
import { assistantFor, DEFAULT_SETTINGS, planLine, programLine, providerOf, resumeCommand } from '../src/shared/api'
import type { ChatSession, ReasoningEffort, SessionItems } from '../src/shared/api'

interface Request {
  id?: RpcId
  method?: string
  params?: Partial<ThreadOptions> & { threadId?: string; turnId?: string; input?: CodexInput[]; cursor?: string | null; cwd?: string | string[]; effort?: ReasoningEffort | null; objective?: string; status?: CodexGoal['status'] }
  result?: Json
  error?: { code: number; message: string }
}

const ROOT = '/work/app'
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

class Server extends EventEmitter implements Held {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly requests: Request[] = []
  readonly stdin = new Writable({ write: (chunk: Buffer, _encoding, done) => {
    const request = JSON.parse(chunk.toString()) as Request
    this.requests.push(request)
    if (request.id !== undefined && request.method !== undefined) this.respond(request)
    done()
  } })
  account: 'chatgpt' | 'apiKey' | null = 'chatgpt'
  history: CodexTurn[] = []
  readonly goals = new Map<string, CodexGoal>()
  pauseResume = false
  turnErrors: string[] = []
  effort: ReasoningEffort = 'high'
  model = 'first'
  resolvedModel: string | undefined
  correctionEfforts: readonly ReasoningEffort[] = ['medium', 'low', 'high']
  next = 0

  reply(id: RpcId, result: object): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`)
  }

  event(event: CodexEvent): void {
    this.stdout.write(`${JSON.stringify(event)}\n`)
  }

  respond(request: Request): void {
    const id = request.id ?? 0
    switch (request.method) {
      case 'initialize': this.reply(id, { userAgent: 'geckit/0.159.3' }); return
      case 'account/read': this.reply(id, { account: this.account === 'chatgpt' ? { type: 'chatgpt', planType: 'plus' } : this.account === null ? null : { type: this.account } }); return
      case 'account/rateLimits/read': this.reply(id, { rateLimits: { limitId: 'codex', limitName: null, primary: { usedPercent: 32, windowDurationMins: 10080, resetsAt: 2000000000 }, secondary: null } }); return
      case 'model/list': this.reply(id, request.params?.cursor === 'next' ? { data: [{ model: 'second', displayName: 'Second', description: 'Another model', hidden: false, supportedReasoningEfforts: this.correctionEfforts.map((reasoningEffort) => ({ reasoningEffort, description: reasoningEffort })) }], nextCursor: null } : { data: [{ model: 'first', displayName: 'First', description: 'First model', hidden: false, defaultReasoningEffort: 'low' }, { model: 'hidden', hidden: true }], nextCursor: 'next' }); return
      case 'thread/start':
      case 'thread/fork': this.model = this.resolvedModel ?? request.params?.model ?? this.model; this.reply(id, { thread: { id: `thread-${String(++this.next)}` }, model: this.model, reasoningEffort: this.effort }); return
      case 'thread/resume': if (!this.pauseResume) { this.model = this.resolvedModel ?? request.params?.model ?? this.model; this.reply(id, { thread: { id: request.params?.threadId }, model: this.model, reasoningEffort: this.effort }) } return
      case 'thread/list': this.reply(id, { data: [{ id: 'terminal', cwd: ROOT, preview: 'From the terminal', name: null, model: 'first', reasoningEffort: this.effort, updatedAt: 100 }], nextCursor: null }); return
      case 'thread/read': this.reply(id, { thread: { id: request.params?.threadId, model: this.model, reasoningEffort: this.effort } }); return
      case 'thread/goal/get': this.reply(id, { goal: this.goals.get(request.params?.threadId ?? '') ?? null }); return
      case 'thread/goal/set': {
        const threadId = request.params?.threadId ?? ''
        const before = this.goals.get(threadId)
        const goal: CodexGoal = { threadId, objective: request.params?.objective ?? before?.objective ?? '', status: request.params?.status ?? 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 100, updatedAt: 100 }
        this.goals.set(threadId, goal)
        this.reply(id, { goal })
        this.event({ method: 'thread/goal/updated', params: { threadId, turnId: null, goal } })
        return
      }
      case 'thread/goal/clear': {
        const threadId = request.params?.threadId ?? ''
        this.goals.delete(threadId)
        this.reply(id, { cleared: true })
        this.event({ method: 'thread/goal/cleared', params: { threadId } })
        return
      }
      case 'thread/turns/list': this.reply(id, { data: this.history, nextCursor: null }); return
      case 'turn/start': {
        const error = this.turnErrors.shift()
        if (error !== undefined) {
          this.stdout.write(`${JSON.stringify({ id, error: { code: -32600, message: error } })}\n`)
          return
        }
        if (request.params?.effort !== undefined) this.effort = request.params.effort ?? 'low'
        const threadId = request.params?.threadId ?? ''
        const turn: CodexTurn = { id: `turn-${threadId}`, status: 'inProgress', error: null, startedAt: 100, items: [] }
        this.event({ method: 'turn/started', params: { threadId, turn } })
        this.reply(id, { turn })
        return
      }
      case 'turn/interrupt': this.reply(id, {}); this.complete(request.params?.threadId ?? '', 'interrupted'); return
      default: this.reply(id, {})
    }
  }

  complete(threadId: string, status: CodexTurn['status'] = 'completed'): void {
    this.event({ method: 'turn/completed', params: { threadId, turn: { id: `turn-${threadId}`, status, error: status === 'failed' ? { message: 'Model failed' } : null, startedAt: 100, items: [] } } })
  }

  kill(): boolean {
    this.stdout.end()
    this.stderr.end()
    this.emit('close')
    return true
  }
}

const providers: CodexSessions[] = []
function setup(): { server: Server; codex: CodexSessions; heard: Heard[] } {
  const server = new Server()
  const codex = new CodexSessions(() => server)
  providers.push(codex)
  return { server, codex, heard: [] }
}

afterEach(() => {
  for (const provider of providers.splice(0)) provider.dispose()
})

describe('Codex app-server', () => {
  it('resumes an unloaded thread and retries the same message once', async () => {
    const { server, codex, heard } = setup()
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'auto', model: 'second', reasoning: 'high' }, (one) => heard.push(one), () => undefined)
    driver.send('First')
    await tick()
    server.complete('terminal')
    server.turnErrors.push('thread not found: terminal')
    driver.send('Continue', [{ media: 'image/png', data: 'AAAA' }], ['Earlier shell output'])
    await tick()
    const turns = server.requests.filter((one) => one.method === 'turn/start')
    expect(turns).toHaveLength(3)
    expect(turns[2]?.params).toEqual(turns[1]?.params)
    expect(turns[2]?.params).toMatchObject({ threadId: 'terminal', model: 'second', effort: 'high', approvalsReviewer: 'auto_review', input: [{ type: 'text', text: 'Earlier shell output\n\nContinue', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,AAAA' }] })
    expect(server.requests.filter((one) => one.method === 'thread/resume')).toHaveLength(2)
    expect(server.requests.some((one) => one.method === 'thread/start')).toBe(false)
    server.complete('terminal')
    expect(heard.flatMap((one) => one.signals).filter((one) => one.kind === 'ended')).toEqual([{ kind: 'ended', how: 'done' }, { kind: 'ended', how: 'done' }])
    await driver.end()
  })

  it.each(['thread not found: another-thread', 'Model failed'])('does not retry a turn rejected with "%s"', async (error) => {
    const { server, codex, heard } = setup()
    server.turnErrors.push(error)
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(1)
    expect(server.requests.filter((one) => one.method === 'thread/resume')).toHaveLength(1)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'failed', text: error })
    await driver.end()
  })

  it('reports failure when the resumed thread still rejects the message', async () => {
    const { server, codex, heard } = setup()
    server.turnErrors.push('thread not found: terminal', 'thread not found: terminal')
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(2)
    expect(server.requests.filter((one) => one.method === 'thread/resume')).toHaveLength(2)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'failed', text: 'thread not found: terminal' })
    await driver.end()
  })

  it('does not resend a stopped message after resuming an unloaded thread', async () => {
    const { server, codex, heard } = setup()
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    await tick()
    server.pauseResume = true
    server.turnErrors.push('thread not found: terminal')
    driver.send('Continue')
    await tick()
    driver.stop()
    const resumed = server.requests.filter((one) => one.method === 'thread/resume').at(-1)
    expect(resumed?.id).toBeDefined()
    server.reply(resumed?.id ?? 0, { thread: { id: 'terminal' }, model: 'first' })
    await tick()
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(1)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'stopped' })
    await driver.end()
  })

  it('corrects text in an ephemeral thread and returns only the final answer', async () => {
    const { server, codex } = setup()
    const answer = codex.correct('teh cat', 'Fix grammar. Output only the text.', 'second')
    await tick()
    expect(server.requests.find((one) => one.method === 'thread/start')?.params).toMatchObject({ ephemeral: true, model: 'second', sandbox: 'read-only', config: { web_search: 'disabled', features: { shell_tool: false, unified_exec: false } } })
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.input?.[0]).toMatchObject({ type: 'text', text: 'Fix grammar. Output only the text.\n\nteh cat' })
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.effort).toBe('low')
    server.event({ method: 'item/completed', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'commentary', text: 'Correcting the spelling.', phase: 'commentary' } } })
    server.event({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'answer', delta: 'the cat' } })
    server.complete('thread-1')
    expect(await answer).toEqual({ ok: true, text: 'the cat' })
    expect(server.requests.find((one) => one.method === 'thread/unsubscribe')?.params?.threadId).toBe('thread-1')
    expect(server.requests.some((one) => one.method === 'thread/delete')).toBe(false)
  })

  it.each([
    { model: 'second', levels: ['high', 'minimal', 'medium'], expected: 'minimal' },
    { model: '', levels: ['high', 'low', 'medium'], expected: 'low' },
    { model: 'alias', levels: ['low', 'none', 'high'], expected: 'none' },
  ] satisfies readonly { model: string; levels: readonly ReasoningEffort[]; expected: ReasoningEffort }[])('uses $expected reasoning for corrections with model "$model"', async ({ model, levels, expected }) => {
    const { server, codex } = setup()
    server.resolvedModel = 'second'
    server.correctionEfforts = levels
    const answer = codex.correct('teh cat', 'Fix it.', model)
    await tick()
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.effort).toBe(expected)
    server.event({ method: 'item/completed', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'answer', text: 'the cat' } } })
    server.complete('thread-1')
    expect(await answer).toEqual({ ok: true, text: 'the cat' })
  })

  it('queues corrections and gives each a fresh temporary conversation', async () => {
    const { server, codex } = setup()
    const first = codex.correct('one', 'Fix it.', '')
    const second = codex.correct('two', 'Fix it.', '')
    await tick()
    expect(server.requests.filter((one) => one.method === 'thread/start')).toHaveLength(1)
    server.event({ method: 'item/completed', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'first', text: 'First' } } })
    server.complete('thread-1')
    expect(await first).toEqual({ ok: true, text: 'First' })
    await tick()
    expect(server.requests.filter((one) => one.method === 'thread/start')).toHaveLength(2)
    server.event({ method: 'item/completed', params: { threadId: 'thread-2', item: { type: 'agentMessage', id: 'second', text: 'Second' } } })
    server.complete('thread-2')
    expect(await second).toEqual({ ok: true, text: 'Second' })
  })

  it('refuses API-key corrections and recovers after a timed-out correction', async () => {
    const { server, codex } = setup()
    server.account = 'apiKey'
    expect(await codex.correct('text', 'Fix it.', '')).toMatchObject({ ok: false })
    expect(server.requests.some((one) => one.method === 'thread/start')).toBe(false)
    server.account = 'chatgpt'
    const failed = codex.correct('one', 'Fix it.', '', 5)
    expect(await failed).toEqual({ ok: false, error: 'Codex did not answer in time' })
    expect(server.requests.some((one) => one.method === 'turn/interrupt')).toBe(true)
    const recovered = codex.correct('two', 'Fix it.', '')
    await tick()
    server.event({ method: 'item/completed', params: { threadId: 'thread-2', item: { type: 'agentMessage', id: 'answer', text: 'Recovered' } } })
    server.complete('thread-2')
    expect(await recovered).toEqual({ ok: true, text: 'Recovered' })
  })

  it('reports the resolved model instead of the requested alias', async () => {
    const { server, codex, heard } = setup()
    server.resolvedModel = 'second'
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual', model: 'alias' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'started', session: 'codex:terminal', model: 'second', key: false, mode: 'manual', reasoning: 'high' })
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'model', model: 'second' })
    await driver.end()
  })

  it('refreshes the displayed model from the native configuration after sending', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:terminal', { shown: true })
    const sessions = new Sessions({ codex, notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    expect((await sessions.list([ROOT]))[0]?.model).toBe('first')
    await sessions.send({ session: 'codex:terminal', root: ROOT, mode: 'manual', text: 'Continue' })
    await tick()
    expect((await sessions.list([ROOT]))[0]?.model).toBe('first')
    server.complete('terminal')
    await tick()
    server.model = 'second'
    await sessions.send({ session: 'codex:terminal', root: ROOT, mode: 'manual', text: 'Continue again' })
    await tick()
    expect((await sessions.list([ROOT]))[0]?.model).toBe('second')
    sessions.dispose()
  })

  it('keeps the resumed reasoning level when no new choice was made', async () => {
    const { server, codex, heard } = setup()
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(server.requests.find((one) => one.method === 'turn/start')?.params).not.toHaveProperty('effort')
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'reasoning', effort: 'high' })
    await driver.end()
  })

  it('selects the saved reasoning level and persists an explicit switch to Default', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:terminal', { shown: true })
    const sessions = new Sessions({ codex, notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    expect((await sessions.list([ROOT]))[0]).toMatchObject({ reasoning: 'high', actualReasoning: 'high' })
    await sessions.send({ session: 'codex:terminal', root: ROOT, mode: 'manual', text: 'Use Default', reasoning: '' })
    await tick()
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.effort).toBe('low')
    expect(notes.all()['codex:terminal']?.reasoning).toBe('')
    expect((await sessions.list([ROOT]))[0]).toMatchObject({ reasoning: '', actualReasoning: 'low' })
    sessions.dispose()
  })

  it('reports saved reasoning and reads the effective level after starting a turn', async () => {
    const { codex, heard } = setup()
    expect((await codex.list([ROOT]))[0]?.actualReasoning).toBe('high')
    const driver = codex.hold({ id: 'codex:terminal', root: ROOT, resume: true, mode: 'manual', reasoning: 'low' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'started', session: 'codex:terminal', model: 'first', key: false, mode: 'manual', reasoning: 'high' })
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'reasoning', effort: 'low' })
    await driver.end()
  })

  it('connects to a running daemon and disconnects without stopping it', async () => {
    if (process.platform === 'win32') return
    const home = await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'geckit-codex-'))
    await mkdir(join(home, 'app-server-control'))
    const http = createServer()
    const sockets = new WebSocketServer({ server: http })
    const connections: Server[] = []
    sockets.on('connection', (socket) => {
      const server = new Server()
      connections.push(server)
      server.stdout.on('data', (data: Buffer) => socket.send(data.toString().trim()))
      socket.on('message', (data) => server.stdin.write(data.toString()))
    })
    await new Promise<void>((resolve) => http.listen(join(home, 'app-server-control', 'app-server-control.sock'), resolve))
    vi.stubEnv('CODEX_HOME', home)
    const first = new CodexSessions()
    const second = new CodexSessions()
    try {
      expect(await first.account()).toMatchObject({ here: true, signedIn: true, provider: 'codex' })
      first.dispose()
      expect(await second.account()).toMatchObject({ here: true, signedIn: true, provider: 'codex' })
      expect(connections).toHaveLength(2)
      expect(connections.every((server) => server.requests[0]?.method === 'initialize')).toBe(true)
    } finally {
      first.dispose()
      second.dispose()
      vi.unstubAllEnvs()
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve) => http.close(() => resolve()))
      await rm(home, { recursive: true })
    }
  })

  it('reports quota windows and applies live quota updates without a thread ID', async () => {
    const server = new Server()
    const updates: object[] = []
    const codex = new CodexSessions(() => server, (account) => updates.push(account))
    providers.push(codex)
    const account = await codex.account()
    expect(account.limits?.[0]?.primary).toEqual({ usedPercent: 32, windowDurationMins: 10080, resetsAt: 2000000000 })
    server.event({ method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'codex', limitName: null, primary: null, secondary: { usedPercent: 80, windowDurationMins: 300, resetsAt: null } } } })
    expect(updates.at(-1)).toMatchObject({ provider: 'codex', limits: [{ primary: null, secondary: { usedPercent: 80, resetsAt: null } }] })
  })
  it('initializes once, reads the ChatGPT account and paginates the model catalog', async () => {
    const { server, codex } = setup()
    const account = await codex.account()
    expect(account).toMatchObject({ here: true, signedIn: true, provider: 'codex', plan: 'plus', program: { version: '0.159.3' } })
    expect(planLine(account)).toBe('Your ChatGPT plus plan')
    expect(programLine(account)).toBe('Codex 0.159.3')
    expect((await codex.models())?.map((model) => model.value)).toEqual(['first', 'second'])
    expect(server.requests.filter((one) => one.method === 'initialize')).toHaveLength(1)
    expect(server.requests[1]?.method).toBe('initialized')
  })

  it('refuses to create a conversation with a key or without a sign-in', async () => {
    const { server, codex } = setup()
    for (const account of ['apiKey', null] as const) {
      server.account = account
      await expect(codex.create(ROOT, 'auto')).rejects.toThrow('ChatGPT plan')
    }
    expect(server.requests.some((one) => one.method === 'thread/start')).toBe(false)
  })

  it('refuses to resume a conversation when the shared daemon uses an API key', async () => {
    const { server, codex, heard } = setup()
    server.account = 'apiKey'
    const driver = codex.hold({ id: 'codex:existing', root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Continue')
    await tick()
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'failed', text: 'Sign in with your ChatGPT plan: run codex login in a terminal.' })
    expect(server.requests.some((one) => one.method === 'thread/resume' || one.method === 'turn/start')).toBe(false)
    await driver.end()
  })

  it('deletes a queued thread before Codex has written its first turn', async () => {
    const { server, codex } = setup()
    const id = await codex.create(ROOT, 'manual')
    expect(await codex.delete(id)).toBe(true)
    expect(server.requests.some((one) => one.method === 'thread/delete')).toBe(false)
    expect(server.requests.find((one) => one.method === 'thread/unsubscribe')?.params?.threadId).toBe(id.slice(6))
  })

  it('ends an interrupted turn and starts Continue as a new active turn', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Check models')
    await tick()
    const threadId = id.slice(6)
    server.event({ method: 'item/started', params: { threadId, item: { type: 'commandExecution', id: 'interrupted', command: 'check-models', cwd: ROOT, status: 'inProgress', aggregatedOutput: null, exitCode: null } } })
    driver.stop()
    await tick()
    expect(heard.flatMap((one) => one.signals).filter((one) => one.kind === 'ended')).toEqual([{ kind: 'ended', how: 'stopped' }])
    const before = heard.length
    driver.send('Continue')
    await tick()
    expect(heard.slice(before).flatMap((one) => one.signals).some((one) => one.kind === 'ended')).toBe(false)
    server.complete(threadId)
    expect(heard.slice(before).flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'done' })
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(2)
    await driver.end()
  })

  it('streams answers and command output, sends pictures and finishes the turn', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual', 'first')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Look at this', [{ media: 'image/png', data: 'AAAA' }], ['Command output'])
    await tick()
    expect(server.requests.some((one) => one.method === 'thread/resume')).toBe(false)
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.input).toEqual([{ type: 'text', text: 'Command output\n\nLook at this', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,AAAA' }])
    const threadId = id.slice(6)
    server.event({ method: 'item/agentMessage/delta', params: { threadId, itemId: 'answer', delta: 'Hello' } })
    server.event({ method: 'item/agentMessage/delta', params: { threadId, itemId: 'answer', delta: ' there' } })
    server.event({ method: 'item/started', params: { threadId, item: { type: 'commandExecution', id: 'command', command: 'npm test', cwd: ROOT, status: 'inProgress', aggregatedOutput: null, exitCode: null } } })
    server.event({ method: 'item/commandExecution/outputDelta', params: { threadId, itemId: 'command', delta: 'Passed' } })
    server.event({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', id: 'answer', text: 'Hello there' } } })
    server.complete(threadId)
    expect(heard.flatMap((one) => one.items)).toContainEqual({ kind: 'theirs', id: 'codex:answer', text: 'Hello there' })
    expect(heard.flatMap((one) => one.items).findLast((one) => one.kind === 'did')).toMatchObject({ live: true, detail: 'npm test\n\nPassed' })
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'done' })
    await driver.end()
  })

  it('keeps progress and final phases while streaming and only finishes on turn completion', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Fix it')
    await tick()
    const threadId = id.slice(6)
    server.event({ method: 'item/started', params: { threadId, item: { type: 'agentMessage', id: 'progress', text: '', phase: 'commentary' } } })
    server.event({ method: 'item/agentMessage/delta', params: { threadId, itemId: 'progress', delta: 'Checking the code.' } })
    expect(heard.at(-1)?.items).toEqual([{ kind: 'theirs', id: 'codex:progress', text: 'Checking the code.', phase: 'commentary' }])
    server.event({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', id: 'progress', text: 'Checking the code.', phase: 'commentary' } } })
    expect(heard.flatMap((one) => one.signals).some((one) => one.kind === 'ended')).toBe(false)
    server.event({ method: 'item/started', params: { threadId, item: { type: 'agentMessage', id: 'answer', text: '', phase: 'final_answer' } } })
    server.event({ method: 'item/agentMessage/delta', params: { threadId, itemId: 'answer', delta: 'Fixed.' } })
    expect(heard.at(-1)?.items).toEqual([{ kind: 'theirs', id: 'codex:answer', text: 'Fixed.', phase: 'final_answer' }])
    server.complete(threadId)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'done' })
    await driver.end()
  })

  it('keeps progress and final phases when reopening native history', async () => {
    const { server, codex } = setup()
    server.history = [{ id: 'turn', startedAt: null, status: 'completed', error: null, items: [
      { type: 'agentMessage', id: 'progress', text: 'Checking.', phase: 'commentary' },
      { type: 'agentMessage', id: 'answer', text: 'Fixed.', phase: 'final_answer' },
    ] }]
    expect((await codex.read(ROOT, 'codex:existing'))?.items).toEqual([
      { kind: 'theirs', id: 'codex:progress', text: 'Checking.', phase: 'commentary' },
      { kind: 'theirs', id: 'codex:answer', text: 'Fixed.', phase: 'final_answer' },
    ])
  })

  it('uses native goal commands without starting a model turn', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('/goal Tests pass')
    await tick()
    expect(server.goals.get(id.slice(6))).toMatchObject({ objective: 'Tests pass', status: 'active' })
    expect(server.requests.some((one) => one.method === 'turn/start')).toBe(false)
    driver.send('/goal pause')
    await tick()
    expect(server.goals.get(id.slice(6))?.status).toBe('paused')
    driver.send('/goal resume')
    await tick()
    expect(server.goals.get(id.slice(6))?.status).toBe('active')
    driver.send('/goal clear')
    await tick()
    expect(server.goals.has(id.slice(6))).toBe(false)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'goal', goal: undefined })
    await driver.end()
  })

  it('returns each approval decision to the matching server request', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Run the tests')
    await tick()
    for (const [requestId, answer, decision] of [[12, 'once', 'accept'], [13, 'session', 'acceptForSession'], [14, 'no', 'decline']] as const) {
      server.event({ method: 'item/commandExecution/requestApproval', id: requestId, params: { threadId: id.slice(6), itemId: 'cmd', command: 'npm test' } })
      driver.answer(String(requestId), answer)
      expect(server.requests.find((one) => one.id === requestId && one.result !== undefined)?.result).toEqual({ decision })
      server.event({ method: 'serverRequest/resolved', params: { threadId: id.slice(6), requestId } })
    }
    expect(heard.flatMap((one) => one.gone)).toEqual([])
    await driver.end()
  })

  it('answers multiple questions with separate cards and one complete response', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Ask me')
    await tick()
    server.event({ method: 'item/tool/requestUserInput', id: 'question', params: { threadId: id.slice(6), itemId: 'ask', questions: [{ id: 'a', question: 'First?', options: [{ label: 'Yes', description: '' }] }, { id: 'b', question: 'Second?', options: null }] } })
    driver.answer('question', 'Yes')
    expect(heard.flatMap((one) => one.signals).filter((one) => one.kind === 'asks').map((one) => one.ask)).toEqual(['question', 'question#1'])
    expect(server.requests.some((one) => one.id === 'question' && one.result !== undefined)).toBe(false)
    driver.answer('question#1', 'Text')
    expect(server.requests.find((one) => one.id === 'question' && one.result !== undefined)?.result).toEqual({ answers: { a: { answers: ['Yes'] }, b: { answers: ['Text'] } } })
    await driver.end()
  })

  it('interrupts the matching turn and keeps other threads connected', async () => {
    const { server, codex, heard } = setup()
    const first = await codex.create(ROOT, 'auto')
    const second = await codex.create(ROOT, 'auto')
    const one = codex.hold({ id: first, root: ROOT, resume: true, mode: 'auto' }, (one) => heard.push(one), () => undefined)
    const two = codex.hold({ id: second, root: ROOT, resume: true, mode: 'auto' }, () => undefined, () => undefined)
    one.send('First')
    two.send('Second')
    await tick()
    one.stop()
    await tick()
    expect(server.requests.find((one) => one.method === 'turn/interrupt')?.params).toEqual({ threadId: first.slice(6), turnId: `turn-${first.slice(6)}` })
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'stopped' })
    await one.end()
    expect(server.stdout.readableEnded).toBe(false)
    await two.end()
  })

  it('honors Stop while the thread is still being resumed', async () => {
    const { server, codex, heard } = setup()
    const id = 'codex:terminal'
    server.pauseResume = true
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Do not start')
    driver.stop()
    await tick()
    const resume = server.requests.find((one) => one.method === 'thread/resume')
    server.reply(resume?.id ?? 0, { thread: { id: id.slice(6) }, model: 'first' })
    await tick()
    expect(server.requests.some((one) => one.method === 'turn/start')).toBe(false)
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'stopped' })
    await driver.end()
  })

  it('clears approval cards resolved by the native reviewer', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'auto')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'auto' }, (one) => heard.push(one), () => undefined)
    driver.send('Work')
    await tick()
    server.event({ method: 'item/commandExecution/requestApproval', id: 77, params: { threadId: id.slice(6), itemId: 'cmd', command: 'npm test' } })
    server.event({ method: 'serverRequest/resolved', params: { threadId: id.slice(6), requestId: 77 } })
    expect(heard.at(-1)).toEqual({ items: [], gone: ['card:77'], signals: [{ kind: 'resolved', ask: '77' }] })
    await driver.end()
  })

  it('omits absent permission profiles when granting additional access', async () => {
    const { server, codex } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, () => undefined, () => undefined)
    driver.send('Work')
    await tick()
    server.event({ method: 'item/permissions/requestApproval', id: 99, params: { threadId: id.slice(6), itemId: 'access', reason: null, permissions: { network: { enabled: true }, fileSystem: null } } })
    driver.answer('99', 'once')
    expect(server.requests.find((one) => one.id === 99 && one.result !== undefined)?.result).toEqual({ permissions: { network: { enabled: true } }, scope: 'turn' })
    await driver.end()
  })

  it('replays native history and preserves its item IDs and images', async () => {
    const { server, codex } = setup()
    server.history = [{ id: 'turn', startedAt: 100, status: 'completed', error: null, items: [{ type: 'userMessage', id: 'mine', content: [{ type: 'text', text: 'Question', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,AAAA' }] }, { type: 'agentMessage', id: 'answer', text: 'Answer' }, { type: 'fileChange', id: 'edit', changes: [{ path: `${ROOT}/file.ts`, diff: '+hello' }], status: 'completed' }] }]
    const read = await codex.read(ROOT, 'codex:terminal')
    expect(read?.items[0]).toEqual({ kind: 'mine', id: 'codex:mine', text: 'Question', images: [{ media: 'image/png', data: 'AAAA' }], at: 100_000 })
    expect(read?.items).toContainEqual({ kind: 'wrote', id: 'codex:edit:wrote', paths: ['file.ts'] })
    expect((await codex.list([ROOT]))[0]).toMatchObject({ id: 'codex:terminal', root: ROOT, title: 'From the terminal' })
  })

  it('reports a process failure to every active conversation', async () => {
    const { server, codex, heard } = setup()
    const id = await codex.create(ROOT, 'manual')
    const driver = codex.hold({ id, root: ROOT, resume: true, mode: 'manual' }, (one) => heard.push(one), () => undefined)
    driver.send('Work')
    await tick()
    server.stderr.write('Process failed')
    server.kill()
    expect(heard.flatMap((one) => one.signals)).toContainEqual({ kind: 'ended', how: 'failed', text: 'Process failed' })
  })
})

describe('provider routing', () => {
  const shell: typeof runShell = (_root, _command, heard) => {
    heard('On branch main\n')
    return { done: Promise.resolve({ stdout: 'On branch main\n', stderr: '', output: 'On branch main\n', code: 0, stopped: false }), stop: () => undefined }
  }

  it('keeps a Codex conversation started with a shell command visible after refreshing and sends its output with the next message', async () => {
    const { server, codex } = setup()
    const sessions = new Sessions({ codex, shell, notes: memoryNotes(), changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, claude: () => { throw new Error('Wrong provider') }, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    try {
      const id = await sessions.shell({ provider: 'codex', root: ROOT, command: 'git status' })
      expect(id).toBe('codex:thread-1')
      await tick()
      codex.list = async () => [{ id, root: ROOT, title: '', stands: '', at: 100_000, driven: true }]
      expect(await sessions.items(id)).toEqual([expect.objectContaining({ kind: 'shell', command: 'git status', output: 'On branch main\n' })])
      expect(await sessions.list([ROOT])).toEqual([expect.objectContaining({ id, provider: 'codex', title: '!git status', here: true })])

      await sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'what changed?' })
      await tick()
      expect(server.requests.find((one) => one.method === 'turn/start')?.params).toMatchObject({ threadId: 'thread-1', input: [{ type: 'text', text: '<bash-input>git status</bash-input>\n\n<bash-stdout>On branch main\n</bash-stdout><bash-stderr></bash-stderr>\n\nwhat changed?', text_elements: [] }] })
    } finally {
      sessions.dispose()
    }
  })

  it('runs a shell command in an uncached Codex conversation despite a stale Claude preference and resumes the same thread', async () => {
    const { server, codex } = setup()
    const sessions = new Sessions({ codex, shell, notes: memoryNotes(), changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, claude: () => { throw new Error('Wrong provider') }, claudeAccount: async () => { throw new Error('Wrong account') }, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    try {
      const id = await sessions.shell({ session: 'codex:migrated', provider: 'claude', root: ROOT, command: 'git status' })
      expect(id).toBe('codex:migrated')
      await tick()
      expect(server.requests.find((one) => one.method === 'thread/turns/list')?.params?.threadId).toBe('migrated')
      expect(await sessions.items(id)).toEqual([expect.objectContaining({ kind: 'shell', output: 'On branch main\n' })])

      await sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'what changed?' })
      await tick()
      expect(server.requests.find((one) => one.method === 'thread/resume')?.params?.threadId).toBe('migrated')
      expect(server.requests.some((one) => one.method === 'thread/start')).toBe(false)
      expect(server.requests.find((one) => one.method === 'turn/start')?.params).toMatchObject({ threadId: 'migrated', input: [{ type: 'text', text: '<bash-input>git status</bash-input>\n\n<bash-stdout>On branch main\n</bash-stdout><bash-stderr></bash-stderr>\n\nwhat changed?', text_elements: [] }] })
    } finally {
      sessions.dispose()
    }
  })

  it('keeps migrated visibility and user changes while hiding external Codex conversations', async () => {
    const { codex } = setup()
    const notes = memoryNotes()
    notes.set('visible', { here: true, title: 'My task', status: 'review', model: 'sonnet' })
    notes.set('hidden', { here: true, hidden: true })
    notes.set('viewed', { seen: 100 })
    codex.list = async () => ['visible', 'hidden', 'external', 'imported', 'viewed'].map((id) => ({ id: `codex:${id}`, root: ROOT, title: id, stands: '', at: Date.now(), driven: true, ...(id === 'external' ? {} : { importedFrom: id }) }))
    const sessions = new Sessions({ codex, notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, there: async () => true, disk: { list: async () => [], read: async () => undefined, has: async () => false, every: async () => [] } })
    expect((await sessions.list([ROOT])).map((one) => one.id)).toEqual(['codex:visible'])
    expect(notes.all()['codex:visible']).toMatchObject({ shown: true, title: 'My task', status: 'review' })
    expect(notes.all()['codex:visible']).not.toHaveProperty('model')
    expect(notes.all()['codex:imported']).toMatchObject({ here: false, shown: false })
    expect(notes.all()['codex:viewed']).toMatchObject({ seen: 100, here: false, shown: false })
    expect((await sessions.hidden([ROOT], false)).flatMap((folder) => folder.chats.map((one) => one.id)).sort()).toEqual(['codex:external', 'codex:hidden', 'codex:imported', 'codex:viewed'])
    sessions.hide('codex:visible')
    sessions.bring('codex:hidden')
    sessions.bring('codex:imported')
    expect((await sessions.list([ROOT])).map((one) => one.id).sort()).toEqual(['codex:hidden', 'codex:imported'])
    sessions.dispose()
  })

  it('uses an enabled assistant and only selects Claude for hosts when Claude is enabled', () => {
    expect(assistantFor({ ...DEFAULT_SETTINGS, chatProvider: 'codex' })).toBe('codex')
    expect(assistantFor({ ...DEFAULT_SETTINGS, chatProvider: 'codex', chatProviders: ['claude'] })).toBe('claude')
    expect(assistantFor({ ...DEFAULT_SETTINGS, chatProviders: ['codex'] }, 'ssh://host/work')).toBe('codex')
    expect(assistantFor({ ...DEFAULT_SETTINGS, chatProvider: 'codex' }, 'ssh://host/work')).toBe('claude')
  })

  it('resumes a migrated Codex conversation absent from the listing without falling back to Claude', async () => {
    const { server, codex } = setup()
    const sessions = new Sessions({ codex, notes: memoryNotes(), changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, claude: () => { throw new Error('Wrong provider') }, claudeAccount: async () => { throw new Error('Wrong account') }, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    const id = await sessions.send({ session: 'codex:migrated', provider: 'claude', root: ROOT, mode: 'manual', text: 'Continue', reasoning: 'high' })
    await tick()
    expect(id).toBe('codex:migrated')
    expect(server.requests.find((one) => one.method === 'thread/resume')?.params?.threadId).toBe('migrated')
    expect(server.requests.some((one) => one.method === 'thread/start')).toBe(false)
    expect(server.requests.find((one) => one.method === 'turn/start')?.params).toMatchObject({ threadId: 'migrated', effort: 'high' })
    sessions.dispose()
  })

  it('rejects a Codex continuation when the Codex backend is absent', async () => {
    const sessions = new Sessions({ notes: memoryNotes(), changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, claude: () => { throw new Error('Wrong provider') } })
    await expect(sessions.send({ session: 'codex:migrated', root: ROOT, mode: 'manual', text: 'Continue' })).rejects.toThrow('Codex is not available')
    sessions.dispose()
  })
  it('keeps legacy sessions on Claude and generates the native Codex resume command', () => {
    expect(providerOf('old-session')).toBe('claude')
    expect(resumeCommand('old-session')).toBe('claude --resume old-session')
    expect(resumeCommand('codex:thread')).toBe('codex resume thread')
  })

  it('maps permission modes without disabling the sandbox or approvals', () => {
    expect(codexOptions(ROOT, 'manual')).toMatchObject({ sandbox: 'workspace-write', approvalPolicy: 'untrusted', approvalsReviewer: 'user' })
    expect(codexOptions(ROOT, 'auto')).toMatchObject({ sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' })
    expect(codexOptions(ROOT, 'plan')).toMatchObject({ sandbox: 'read-only', approvalPolicy: 'on-request' })
    expect(codexEnvironment({ OPENAI_API_KEY: 'test-key', CODEX_API_KEY: 'test-key', OPENAI_BASE_URL: 'https://example.test', CODEX_THREAD_ID: 'parent', CODEX_HOME: '/custom', PATH: '/bin' })).toMatchObject({ CODEX_HOME: '/custom' })
    expect(codexEnvironment({ OPENAI_API_KEY: 'test-key', CODEX_API_KEY: 'test-key' })).not.toHaveProperty('OPENAI_API_KEY')
    expect(codexEnvironment({ CODEX_API_KEY: 'test-key' })).not.toHaveProperty('CODEX_API_KEY')
  })

  it('starts, queues and restores Codex sessions without invoking Claude', async () => {
    const { server, codex } = setup()
    const rows: ChatSession[][] = []
    const items: SessionItems[] = []
    const notes = memoryNotes()
    const sessions = new Sessions({ codex, notes, changed: (all) => rows.push([...all]), items: (one) => items.push(one), account: () => undefined, notify: () => undefined, there: async () => true, claudeAccount: async () => { throw new Error('Wrong provider') }, disk: { list: async () => [], read: async () => undefined, has: async () => false }, usage: async () => ({ windows: new Map() }), claudeProgram: async () => undefined })
    const id = await sessions.send({ root: ROOT, provider: 'codex', mode: 'manual', text: 'First' })
    await tick()
    expect(rows.at(-1)?.find((one) => one.id === id)).toMatchObject({ provider: 'codex', state: 'working', model: 'first' })
    await sessions.send({ session: id, root: ROOT, mode: 'manual', text: 'Second' })
    expect(notes.all()[id]?.queued?.[0]?.message.session).toBe(id)
    server.event({ method: 'item/agentMessage/delta', params: { threadId: id.slice(6), itemId: 'answer', delta: 'Done' } })
    server.complete(id.slice(6))
    sessions.carryOn(id)
    await tick()
    expect(server.requests.filter((one) => one.method === 'thread/start')).toHaveLength(1)
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(2)
    expect((await sessions.list([ROOT])).some((one) => one.id === 'codex:terminal')).toBe(false)
    expect((await sessions.hidden([ROOT], true)).flatMap((one) => one.chats).some((one) => one.id === 'codex:terminal')).toBe(true)
    sessions.bring('codex:terminal')
    expect((await sessions.list([ROOT])).find((one) => one.id === 'codex:terminal')?.provider).toBe('codex')
    sessions.hide('codex:terminal')
    expect((await sessions.hidden([ROOT], true)).flatMap((one) => one.chats).some((one) => one.id === 'codex:terminal')).toBe(true)
    sessions.bring('codex:terminal')
    server.history = [{ id: 'old', startedAt: 100, status: 'completed', error: null, items: [{ type: 'agentMessage', id: 'native-answer', text: 'Native history' }] }]
    expect(await sessions.items('codex:terminal')).toContainEqual({ kind: 'theirs', id: 'codex:native-answer', text: 'Native history' })
    sessions.dispose()
  })

  it('attaches a native goal before the first turn and moves a completed goal to review', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    const rows: ChatSession[][] = []
    const sessions = new Sessions({ codex, notes, changed: (all) => rows.push([...all]), items: () => undefined, account: () => undefined, notify: () => undefined, there: async () => true, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    const id = await sessions.send({ root: ROOT, provider: 'codex', mode: 'auto', text: 'Fix the bug', goal: 'The bug is fixed and tests pass' })
    await tick()
    const set = server.requests.findIndex((one) => one.method === 'thread/goal/set')
    const turn = server.requests.findIndex((one) => one.method === 'turn/start')
    expect(set).toBeGreaterThan(-1)
    expect(turn).toBeGreaterThan(set)
    expect(rows.at(-1)?.find((one) => one.id === id)?.goal?.condition).toBe('The bug is fixed and tests pass')
    await sessions.send({ session: id, root: ROOT, mode: 'auto', text: '/goal The regression test passes' })
    expect(server.goals.get(id.slice(6))?.objective).toBe('The regression test passes')
    expect(rows.at(-1)?.find((one) => one.id === id)).toMatchObject({ state: 'working', goal: { condition: 'The regression test passes' } })
    await sessions.send({ session: id, root: ROOT, mode: 'auto', text: '/goal clear' })
    expect(server.goals.has(id.slice(6))).toBe(false)
    expect(rows.at(-1)?.find((one) => one.id === id)).toMatchObject({ state: 'working' })
    expect(rows.at(-1)?.find((one) => one.id === id)?.goal).toBeUndefined()
    await sessions.send({ session: id, root: ROOT, mode: 'auto', text: '/goal The regression test passes' })
    expect(server.requests.filter((one) => one.method === 'turn/start')).toHaveLength(1)
    const current = server.goals.get(id.slice(6))
    expect(current).toBeDefined()
    if (current === undefined) return
    const goal = { ...current, status: 'complete' as const }
    server.goals.set(id.slice(6), goal)
    server.event({ method: 'thread/goal/updated', params: { threadId: id.slice(6), turnId: null, goal } })
    await tick()
    expect(rows.at(-1)?.find((one) => one.id === id)?.status).toBeUndefined()
    expect(rows.at(-1)?.find((one) => one.id === id)?.state).toBe('working')
    server.complete(id.slice(6))
    await tick()
    expect(rows.at(-1)?.find((one) => one.id === id)).toMatchObject({ status: 'review' })
    expect(rows.at(-1)?.find((one) => one.id === id)?.goal).toBeUndefined()
    await sessions.send({ session: id, root: ROOT, mode: 'auto', text: '/goal A new outcome is verified' })
    expect(rows.at(-1)?.find((one) => one.id === id)?.status).toBeUndefined()
    expect(rows.at(-1)?.find((one) => one.id === id)?.goal?.condition).toBe('A new outcome is verified')
    sessions.dispose()
  })

  it('reconciles a goal completed while GeckIt was closed', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:terminal', { shown: true, goal: { condition: 'Tests pass', checks: 0 } })
    server.goals.set('terminal', { threadId: 'terminal', objective: 'Tests pass', status: 'complete', tokenBudget: null, tokensUsed: 1, timeUsedSeconds: 1, createdAt: 100, updatedAt: 200 })
    const sessions = new Sessions({ codex, notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    expect((await sessions.list([ROOT])).find((one) => one.id === 'codex:terminal')).toMatchObject({ status: 'review' })
    expect(notes.all()['codex:terminal']?.goal).toBeUndefined()
    sessions.dispose()
  })

  it('shows goals created outside GeckIt and refreshes an open conversation', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:terminal', { shown: true })
    server.goals.set('terminal', { threadId: 'terminal', objective: 'test', status: 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 100, updatedAt: 100 })
    const rows: ChatSession[][] = []
    const sessions = new Sessions({ codex, notes, changed: (all) => rows.push([...all]), items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    sessions.watching('codex:terminal')
    expect((await sessions.list([ROOT])).find((one) => one.id === 'codex:terminal')?.goal?.condition).toBe('test')
    server.goals.set('terminal', { ...server.goals.get('terminal')!, objective: 'idle edit' })
    await sessions.items('codex:terminal')
    expect(rows.at(-1)?.find((one) => one.id === 'codex:terminal')?.goal?.condition).toBe('idle edit')
    await sessions.send({ session: 'codex:terminal', root: ROOT, mode: 'auto', text: 'Continue' })
    await tick()
    server.goals.set('terminal', { ...server.goals.get('terminal')!, objective: 'edited' })
    await sessions.items('codex:terminal')
    expect(rows.at(-1)?.find((one) => one.id === 'codex:terminal')?.goal?.condition).toBe('edited')
    server.goals.delete('terminal')
    await sessions.items('codex:terminal')
    expect(rows.at(-1)?.find((one) => one.id === 'codex:terminal')?.goal).toBeUndefined()
    sessions.dispose()
  })

  it('updates the open conversation when a goal changes during a Codex turn', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:terminal', { shown: true })
    const rows: ChatSession[][] = []
    const sessions = new Sessions({ codex, notes, changed: (all) => rows.push([...all]), items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false } })
    await sessions.list([ROOT])
    await sessions.send({ session: 'codex:terminal', root: ROOT, mode: 'auto', text: 'Continue' })
    await tick()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      sessions.watching('codex:terminal')
      await tick()
      server.goals.set('terminal', { threadId: 'terminal', objective: 'this is a test goal', status: 'active', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 100, updatedAt: 100 })
      await vi.advanceTimersByTimeAsync(2_000)
      await tick()
      expect(rows.at(-1)?.find((one) => one.id === 'codex:terminal')?.goal?.condition).toBe('this is a test goal')
      const refreshed = rows.length
      await vi.advanceTimersByTimeAsync(2_000)
      await tick()
      expect(rows).toHaveLength(refreshed)
      server.goals.delete('terminal')
      await vi.advanceTimersByTimeAsync(2_000)
      await tick()
      expect(rows.at(-1)?.find((one) => one.id === 'codex:terminal')?.goal).toBeUndefined()
    } finally {
      sessions.dispose()
      vi.useRealTimers()
    }
  })

  it('starts a restored conversation whose first message was queued before quitting', async () => {
    const { server, codex } = setup()
    const notes = memoryNotes()
    notes.set('codex:unsaved', { unborn: ROOT, title: 'Waiting', mode: 'manual', queued: [{ id: 'queued:first', at: 100, message: { session: 'codex:unsaved', root: ROOT, mode: 'manual', text: 'First message' } }] })
    const rows: ChatSession[][] = []
    const sessions = new Sessions({ codex, notes, changed: (all) => rows.push([...all]), items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [], read: async () => undefined, has: async () => false }, usage: async () => ({ windows: new Map() }), claudeProgram: async () => undefined })
    sessions.carryOn('codex:unsaved')
    await tick()
    expect(server.requests.some((one) => one.method === 'thread/resume')).toBe(false)
    expect(server.requests.find((one) => one.method === 'turn/start')?.params?.threadId).toBe('thread-1')
    expect(rows.at(-1)?.find((one) => one.id === 'codex:thread-1')).toMatchObject({ state: 'working', title: 'Waiting' })
    expect(rows.at(-1)?.some((one) => one.id === 'codex:unsaved')).toBe(false)
    sessions.dispose()
  })
})
