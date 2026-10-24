import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramBotClient, TelegramFailure } from '../src/main/telegram-bot'
import { TelegramTyping } from '../src/main/telegram-typing'

afterEach(() => vi.useRealTimers())

describe('Telegram native typing clock', () => {
  it('refreshes past five seconds, reasserts after commentary, and leaves no timer after final or abort', async () => {
    vi.useFakeTimers()
    const send = vi.fn<(signal: AbortSignal) => Promise<void>>(async () => undefined)
    const controller = new AbortController()
    const typing = new TelegramTyping(send, controller.signal)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(send).toHaveBeenCalledTimes(4)
    typing.sent()
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(5)
    typing.update(false)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(send).toHaveBeenCalledTimes(5)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect(vi.getTimerCount()).toBe(0)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(send).toHaveBeenCalledTimes(6)
  })

  it('honors retry_after despite commentary and new work without retrying input', async () => {
    vi.useFakeTimers()
    const send = vi.fn<(signal: AbortSignal) => Promise<void>>().mockRejectedValueOnce(new TelegramFailure(429, 20)).mockResolvedValue(undefined)
    const typing = new TelegramTyping(send, new AbortController().signal)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(0)
    typing.sent()
    typing.update(false)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(19_999)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
    typing.update(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts in-flight action and ignores stale completion', async () => {
    vi.useFakeTimers()
    let finish: (() => void) | undefined
    const send = vi.fn<(signal: AbortSignal) => Promise<void>>(() => new Promise<void>((resolve) => { finish = resolve }))
    const typing = new TelegramTyping(send, new AbortController().signal)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(0)
    const signal = send.mock.calls[0]?.[0]
    typing.update(false)
    expect(signal?.aborted).toBe(true)
    finish?.()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(send).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reasserts after commentary which arrives during an in-flight action', async () => {
    vi.useFakeTimers()
    let finish: (() => void) | undefined
    const send = vi.fn<(signal: AbortSignal) => Promise<void>>().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue(undefined)
    const typing = new TelegramTyping(send, new AbortController().signal)
    typing.update(true)
    await vi.advanceTimersByTimeAsync(0)
    typing.sent()
    finish?.()
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
    typing.update(false)
  })

  it('parses Telegram retry_after without exposing response descriptions', async () => {
    const client = new TelegramBotClient('fixture', async () => Response.json({ ok: false, error_code: 429, description: 'untrusted secret', parameters: { retry_after: 17 } }, { status: 429 }))
    await expect(client.call('sendChatAction', { chat_id: 81, action: 'typing' })).rejects.toMatchObject({ code: 429, retryAfter: 17 })
  })
})
