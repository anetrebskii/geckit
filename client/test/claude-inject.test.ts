import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { holdClaude } from '../src/main/sessions/claude'
import type { Held } from '../src/main/sessions/claude'
import type { Heard } from '../src/main/sessions/heard'
import type { SessionImage, SessionMessage } from '../src/shared/api'

type TextBlock = Pick<SessionMessage, 'text'> & { type: 'text' }
type ImageBlock = { type: 'image'; source: Pick<SessionImage, 'data'> & { type: 'base64'; media_type: SessionImage['media'] } }
interface Input {
  type: 'user' | 'control_request'
  priority?: 'next'
  message?: { role: 'user'; content: string | (TextBlock | ImageBlock)[] }
  request?: { subtype: string }
}

class Process extends EventEmitter implements Held {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly inputs: Input[] = []
  failure: Error | undefined
  readonly stdin = new Writable({ write: (chunk: Buffer, _encoding, done) => {
    this.inputs.push(JSON.parse(chunk.toString()) as Input)
    done(this.failure)
  } })
  kill(): boolean {
    this.stdout.end()
    this.stderr.end()
    this.emit('close')
    return true
  }
}

function held(): { process: Process; driver: ReturnType<typeof holdClaude>; heard: Heard[] } {
  const process = new Process()
  const heard: Heard[] = []
  const driver = holdClaude({ root: '/work', id: 'session', resume: true, mode: 'manual', launch: () => process }, (one) => heard.push(one), () => undefined)
  return { process, driver, heard }
}

describe('Claude active input', () => {
  it('writes next-priority guidance and attachments without an interrupt or new lifecycle', async () => {
    const { process, driver, heard } = held()
    driver.send('Original')
    await driver.inject?.('Guidance', [{ media: 'image/png', data: 'AAAA' }], ['Earlier shell output'])
    expect(process.inputs).toEqual([
      { type: 'user', message: { role: 'user', content: 'Original' } },
      { type: 'user', priority: 'next', message: { role: 'user', content: [{ type: 'text', text: 'Earlier shell output' }, { type: 'text', text: 'Guidance' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] } },
    ])
    expect(heard.flatMap((one) => one.signals)).toEqual([])
    await driver.end()
  })

  it('rejects idle, stopped and closed sessions without writing guidance', async () => {
    const { process, driver } = held()
    await expect(driver.inject?.('Too early')).rejects.toThrow('no longer working')
    driver.send('Original')
    driver.stop()
    await expect(driver.inject?.('Stopped')).rejects.toThrow('no longer working')
    await driver.end()
    await expect(driver.inject?.('Closed')).rejects.toThrow('no longer working')
    expect(process.inputs).toHaveLength(2)
  })

  it('rejects after the active turn completes', async () => {
    const { process, driver } = held()
    driver.send('Original')
    process.stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Done' })}\n`)
    await expect(driver.inject?.('Too late')).rejects.toThrow('no longer working')
    await driver.end()
  })

  it('preserves native approval and sends no guidance while it awaits an answer', async () => {
    const { process, driver, heard } = held()
    driver.send('Original')
    process.stdout.write(`${JSON.stringify({ type: 'control_request', request_id: 'approval', request: { subtype: 'can_use_tool', tool_name: 'Bash', tool_use_id: 'command', input: { command: 'ls' } } })}\n`)
    await expect(driver.inject?.('Guidance')).rejects.toThrow('Answer the assistant')
    expect(process.inputs).toHaveLength(1)
    expect(heard.flatMap((one) => one.signals).filter((one) => one.kind === 'asks')).toHaveLength(1)
    await driver.end()
  })

  it('propagates pipe write errors without reporting accepted delivery', async () => {
    const { process, driver, heard } = held()
    driver.send('Original')
    process.failure = new Error('Broken pipe')
    await expect(driver.inject?.('Guidance')).rejects.toThrow('Broken pipe')
    expect(process.inputs.some((one) => one.request?.subtype === 'interrupt')).toBe(false)
    expect(heard.flatMap((one) => one.signals).some((one) => one.kind === 'begun' || one.kind === 'ended')).toBe(false)
    await driver.end()
  })
})
