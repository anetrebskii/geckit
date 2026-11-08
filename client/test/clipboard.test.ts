import { beforeEach, expect, it, vi } from 'vitest'
import { clipboard, ClipboardItem } from 'electron'
import { copyRichText, correctionText } from '../src/main/clipboard'

const fakes = vi.hoisted(() => ({
  readText: vi.fn<() => Promise<string>>(),
  selected: vi.fn<() => Promise<string>>(),
  write: vi.fn<(items: Electron.ClipboardItem[]) => Promise<void>>(),
}))
vi.mock('electron', () => ({
  clipboard: { readText: fakes.readText, write: fakes.write, selection: undefined },
  ClipboardItem: class {
    readonly types: string[]
    constructor(private readonly data: { 'text/plain': string; 'text/html': string }) { this.types = Object.keys(data) }
    async getType(type: keyof typeof this.data): Promise<Blob> { return new Blob([this.data[type]], { type }) }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  fakes.readText.mockResolvedValue('system clipboard')
  fakes.selected.mockResolvedValue('selected text')
  fakes.write.mockResolvedValue()
  Object.defineProperty(clipboard, 'selection', { value: undefined, configurable: true })
})

it('awaits the system clipboard on platforms without a selection clipboard', async () => {
  expect(await correctionText()).toBe('system clipboard')
  expect(fakes.readText).toHaveBeenCalledOnce()
})

it('uses the Linux selection before the system clipboard', async () => {
  Object.defineProperty(clipboard, 'selection', { value: { readText: fakes.selected }, configurable: true })
  expect(await correctionText()).toBe('selected text')
  expect(fakes.readText).not.toHaveBeenCalled()
})

it('falls back when the Linux selection is empty', async () => {
  fakes.selected.mockResolvedValue('')
  Object.defineProperty(clipboard, 'selection', { value: { readText: fakes.selected }, configurable: true })
  expect(await correctionText()).toBe('system clipboard')
})

it('writes both text formats atomically and waits for the native write', async () => {
  let finish: (() => void) | undefined
  fakes.write.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  const copied = vi.fn()
  const writing = copyRichText('hello', '<b>hello</b>').then(copied)
  await Promise.resolve()
  expect(copied).not.toHaveBeenCalled()
  const item = fakes.write.mock.calls[0]?.[0][0]
  expect(item).toBeInstanceOf(ClipboardItem)
  expect(item?.types).toEqual(['text/plain', 'text/html'])
  expect(await (await item?.getType('text/plain'))?.text()).toBe('hello')
  expect(await (await item?.getType('text/html'))?.text()).toBe('<b>hello</b>')
  finish?.()
  await writing
  expect(copied).toHaveBeenCalledOnce()
})

it('propagates native clipboard failures to the caller', async () => {
  fakes.readText.mockRejectedValue(new Error('Read failed'))
  fakes.write.mockRejectedValue(new Error('Write failed'))
  await expect(correctionText()).rejects.toThrow('Read failed')
  await expect(copyRichText('hello', '<b>hello</b>')).rejects.toThrow('Write failed')
})
