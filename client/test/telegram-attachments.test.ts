import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { TelegramAttachments, TELEGRAM_CACHE_LIMIT, TELEGRAM_DOWNLOAD_LIMIT, TELEGRAM_RETENTION, telegramFilename } from '../src/main/telegram-attachments'
import { TelegramBotClient, telegramUpdate } from '../src/main/telegram-bot'
import type { TelegramFile } from '../src/main/telegram-bot'

const folders: string[] = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })
const temporary = (): string => { const folder = mkdtempSync(join(tmpdir(), 'telegram-files-')); folders.push(folder); return folder }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64')
const document: TelegramFile = { fileId: 'opaque-id', name: 'report.txt', media: 'text/plain', photo: false }
const response = (result: object): Response => Response.json({ ok: true, result })

describe('bounded Telegram attachment storage', () => {
  it('keeps exact image/file bytes under generated paths, safely handles metadata.json and reopens after restart', () => {
    const directory = temporary()
    const store = new TelegramAttachments(directory)
    const photo = store.put(png, '../../CON.png', 'application/octet-stream')
    const text = store.put(Buffer.from('Task data\nsecond line'), 'metadata.json', 'text/plain')
    expect(photo.name).toBe('__.._CON.png')
    expect(store.input([photo.id]).images).toEqual([{ media: 'image/png', data: png.toString('base64') }])
    const restarted = new TelegramAttachments(directory)
    const read = restarted.read(text.id)
    expect(read.bytes.toString()).toBe('Task data\nsecond line')
    expect(read.path).toBe(join(realpathSync(directory), 'telegram-attachments', text.id, 'content.json'))
    expect(restarted.input([text.id]).text).toContain('Task data\nsecond line')
    expect(statSync(read.path).mode & 0o777).toBe(0o600)
    expect(telegramFilename('CON.txt')).toBe('_CON.txt')
    expect(telegramFilename('hello. ')).toBe('hello')
  })

  it('expires unreferenced inputs at 24h, pins queued references and counts them toward its 200MiB cap', () => {
    const directory = temporary()
    let now = 1_800_000_000_000
    const store = new TelegramAttachments(directory, () => now)
    const kept = store.put(Buffer.from('keep'), 'kept.txt', 'text/plain')
    const expired = store.put(Buffer.from('expire'), 'expired.txt', 'text/plain')
    store.pin('queued', [kept.id])
    now += TELEGRAM_RETENTION + 1
    store.cleanup()
    expect(store.read(kept.id).bytes.toString()).toBe('keep')
    expect(() => store.read(expired.id)).toThrow('expired or is unavailable')
    const block = Buffer.alloc(TELEGRAM_DOWNLOAD_LIMIT, 65)
    for (let index = 0; index < TELEGRAM_CACHE_LIMIT / TELEGRAM_DOWNLOAD_LIMIT - 1; index++) store.put(block, 'large.bin', 'application/octet-stream')
    expect(() => store.put(block, 'full.bin', 'application/octet-stream')).toThrow('storage is full')
    expect(store.read(kept.id).bytes.toString()).toBe('keep')
    store.pin('queued', [])
    store.cleanup()
    expect(() => store.read(kept.id)).toThrow('expired or is unavailable')
    store.clear()
    expect(existsSync(store.directory)).toBe(false)
  })

  it('bounds tiny attachment entries independently of their payload byte count', () => {
    const store = new TelegramAttachments(temporary())
    for (let index = 0; index < 256; index++) store.put(Buffer.from('x'), 'tiny.txt', 'text/plain')
    expect(() => store.put(Buffer.from('x'), 'tiny.txt', 'text/plain')).toThrow('256 files')
  })

  it('rejects changed bytes, symlinked cache and payload paths without reading outside files', () => {
    const directory = temporary()
    const store = new TelegramAttachments(directory)
    const asset = store.put(Buffer.from('source'), 'source.txt', 'text/plain')
    const path = store.read(asset.id).path
    writeFileSync(path, 'different size')
    expect(() => store.read(asset.id)).toThrow('unavailable')
    const second = store.put(Buffer.from('other'), 'other.txt', 'text/plain')
    const file = store.read(second.id).path
    writeFileSync(join(directory, 'outside.txt'), 'private')
    chmodSync(file, 0o600)
    rmSync(file)
    symlinkSync(join(directory, 'outside.txt'), file)
    expect(() => store.read(second.id)).toThrow('unavailable')
    const linkedDirectory = temporary()
    symlinkSync(store.directory, join(linkedDirectory, 'telegram-attachments'))
    expect(() => new TelegramAttachments(linkedDirectory).cleanup()).toThrow('storage is a link')
    expect(readFileSync(join(directory, 'outside.txt'), 'utf8')).toBe('private')
  })
})

describe('Telegram binary transport contract', () => {
  it('selects highest resolution downloadable photo and preserves document caption and media-group identity', () => {
    const source = { message_id: 4, date: 100, chat: { id: 81, type: 'private' }, from: { id: 81, first_name: 'Alex' }, caption: 'Inspect this', media_group_id: 'album-4', photo: [{ file_id: 'tiny', width: 20, height: 20, file_size: 100 }, { file_id: 'best', width: 1600, height: 1200, file_size: 4000 }, { file_id: 'too-large', width: 5000, height: 4000, file_size: TELEGRAM_DOWNLOAD_LIMIT + 1 }] }
    const photo = telegramUpdate({ update_id: 4, message: source })?.message
    expect(photo?.file?.fileId).toBe('best')
    expect(photo?.text).toBe('Inspect this')
    expect(photo?.mediaGroup).toBe('album-4')
    const imageDocument = telegramUpdate({ update_id: 5, message: { ...source, photo: [], document: { file_id: 'image-doc', file_name: 'screen.png', mime_type: 'image/png', file_size: png.length } } })?.message
    expect(imageDocument?.file).toEqual({ fileId: 'image-doc', name: 'screen.png', media: 'image/png', size: png.length, photo: false })
  })

  it('downloads actual bytes only from validated Telegram paths without redirects and hides token-bearing fetch errors', async () => {
    const urls: string[] = []
    const client = new TelegramBotClient('secret-token', async (url, init) => {
      urls.push(String(url))
      if (String(url).endsWith('/getFile')) return response({ file_path: 'documents/file_4.txt', file_size: 7 })
      expect(init?.redirect).toBe('error')
      return new Response('content')
    })
    expect((await client.download(document, new AbortController().signal)).toString()).toBe('content')
    expect(urls).toEqual(['https://api.telegram.org/botsecret-token/getFile', 'https://api.telegram.org/file/botsecret-token/documents/file_4.txt'])
    const broken = new TelegramBotClient('secret-token', async (url) => { if (String(url).endsWith('/getFile')) return response({ file_path: 'documents/file.txt' }); throw new Error(String(url)) })
    await expect(broken.download(document, new AbortController().signal)).rejects.toThrow('download failed')
    await expect(broken.download(document, new AbortController().signal)).rejects.not.toThrow('secret-token')
  })

  it('rejects advertised, getFile and streamed oversize, invalid paths, empty bodies and network errors', async () => {
    let calls = 0
    const client = new TelegramBotClient('token', async () => { calls++; return response({ file_path: '../private' }) })
    await expect(client.download({ ...document, size: TELEGRAM_DOWNLOAD_LIMIT + 1 }, new AbortController().signal)).rejects.toThrow('20 MiB')
    expect(calls).toBe(0)
    await expect(client.download(document, new AbortController().signal)).rejects.toThrow('invalid file location')
    expect(calls).toBe(1)
    for (const body of [new Uint8Array(0), new Uint8Array(TELEGRAM_DOWNLOAD_LIMIT + 1)]) {
      const stream = new TelegramBotClient('token', async (url) => String(url).endsWith('/getFile') ? response({ file_path: 'documents/file.txt' }) : new Response(body))
      await expect(stream.download(document, new AbortController().signal)).rejects.toThrow('download failed')
    }
    const oversized = new TelegramBotClient('token', async () => response({ file_path: 'documents/file.txt', file_size: TELEGRAM_DOWNLOAD_LIMIT + 1 }))
    await expect(oversized.download(document, new AbortController().signal)).rejects.toThrow('20 MiB')
  })

  it('uploads exact photo/document bytes and captions as multipart with no parse mode or retry', async () => {
    const calls: string[] = []
    const client = new TelegramBotClient('token', async (url, init) => {
      calls.push(String(url))
      const form = init?.body
      expect(form).toBeInstanceOf(FormData)
      if (!(form instanceof FormData)) throw new Error('Missing multipart body')
      expect(form.get('chat_id')).toBe('81')
      expect(form.get('caption')).toBe('Finished <report>')
      expect(form.has('parse_mode')).toBe(false)
      const payload = form.get(String(url).endsWith('sendPhoto') ? 'photo' : 'document')
      if (!(payload instanceof Blob)) throw new Error('Missing file bytes')
      expect(Buffer.from(await payload.arrayBuffer())).toEqual(png)
      return response({ message_id: 201 })
    })
    for (const kind of ['photo', 'document'] as const) expect(await client.upload(81, png, 'result.png', 'image/png', 'Finished <report>', kind, new AbortController().signal)).toBe(201)
    expect(calls).toHaveLength(2)
    const failed = new TelegramBotClient('secret', async () => { throw new Error('https://api.telegram.org/botsecret/sendPhoto') })
    await expect(failed.upload(81, png, 'result.png', 'image/png', '', 'photo', new AbortController().signal)).rejects.toThrow('uncertain')
  })
})
