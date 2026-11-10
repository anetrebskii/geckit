import { describe, expect, it } from 'vitest'
import { codexHistory, codexItem } from '../src/main/sessions/codex-read'
import type { CodexItem } from '../src/main/sessions/codex-protocol'

const image = { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }
const tool = (content: unknown): Extract<CodexItem, { type: 'mcpToolCall' }> => ({ type: 'mcpToolCall', id: 'shot', server: 'playwright', tool: 'screenshot', status: 'completed', error: null, arguments: {}, result: { content } } as Extract<CodexItem, { type: 'mcpToolCall' }>)

describe('Codex tool screenshots', () => {
  it('keeps screenshots in live results and reopened history while preserving the surrounding text', () => {
    const item = tool([{ type: 'text', text: 'Saved screenshot' }, image])
    const expected = { kind: 'did', id: 'codex:shot', images: [{ media: 'image/png', data: image.data }] }
    expect(codexItem(item, '/work')[0]).toMatchObject(expected)
    expect(codexHistory([{ id: 'turn', startedAt: 100, error: null, status: 'completed', items: [item] }], '/work')[0]).toMatchObject(expected)
    const result = codexItem(item, '/work')[0]
    expect(result).toHaveProperty('detail', expect.stringContaining('Saved screenshot'))
    expect(result).toHaveProperty('detail', expect.not.stringContaining(image.data))
  })
  it('does not expose oversized or unsupported image bytes in tool details', () => {
    const result = codexItem(tool([{ ...image, mimeType: 'image/svg+xml' }, { ...image, data: 'A'.repeat(8 * 1024 * 1024 + 1) }]), '/work')[0]
    expect(result).not.toHaveProperty('images')
    expect(result).toHaveProperty('detail', expect.stringContaining('[image]'))
    expect(JSON.stringify(result).length).toBeLessThan(1000)
  })
  it('keeps ordinary results and failures readable', () => {
    expect(codexItem(tool([{ type: 'text', text: 'No image' }]), '/work')[0]).not.toHaveProperty('images')
    expect(codexItem({ ...tool(null), error: { message: 'Failed screenshot' } }, '/work')[0]).toHaveProperty('detail', 'Failed screenshot')
  })
})

