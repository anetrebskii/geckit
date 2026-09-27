import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ dialog: {}, Menu: {}, shell: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({ getSettings: vi.fn(), setSettings: vi.fn() }))

const { fileShown } = await import('../src/main/file-shown')

describe('a file read for the phone', () => {
  const root = mkdtempSync(join(tmpdir(), 'file-shown-'))
  writeFileSync(join(root, 'look.css'), 'b { color: red }')
  writeFileSync(join(root, 'dot.png'), Buffer.from([137, 80, 78, 71]))
  writeFileSync(join(root, 'page.html'), '<link rel="stylesheet" href="look.css"><img src="dot.png"><a href="https://example.com/x.css">x</a><img src="gone.png">')
  writeFileSync(join(root, 'notes.md'), '# Notes')
  writeFileSync(join(root, 'blob.bin'), Buffer.from([1, 0, 2]))

  it('puts what a page links to inside it, and leaves the web and what is missing alone', async () => {
    const shown = await fileShown(root, 'page.html')
    expect(shown.kind).toBe('page')
    const html = shown.kind === 'page' ? shown.html : ''
    expect(html).toContain(`href="data:text/css;base64,${Buffer.from('b { color: red }').toString('base64')}"`)
    expect(html).toContain('src="data:image/png;base64,iVBORw=="')
    expect(html).toContain('href="https://example.com/x.css"')
    expect(html).toContain('src="gone.png"')
  })

  it('reads a picture, Markdown, and says why for what it cannot show', async () => {
    expect(await fileShown(root, 'dot.png')).toEqual({ kind: 'picture', image: { media: 'image/png', data: 'iVBORw==' } })
    expect(await fileShown(root, 'notes.md')).toEqual({ kind: 'markdown', text: '# Notes' })
    expect((await fileShown(root, 'blob.bin')).kind).toBe('none')
    expect((await fileShown(root, 'nothing.txt')).kind).toBe('none')
    expect((await fileShown(root, '.')).kind).toBe('none')
  })
})
