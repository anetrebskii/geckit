import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { pictureData, picturePath } from '../src/shared/pictures'
vi.stubGlobal('window', {})
const { Prose } = await import('../src/renderer/src/chat/Prose')

describe('pictures in answers', () => {
  it.each([['E:/probes/screen.png', 'E:/probes/screen.png'], ['file:///E:/screen%20one.png', 'E:/screen one.png'], ['/E:/screen.png', 'E:/screen.png'], ['/tmp/screen.png', '/tmp/screen.png'], ['shots/one.png', 'shots/one.png']])('accepts local path %s', (src, expected) => expect(picturePath(src)).toBe(expected))
  it.each(['https://example.com/image.png', '//example.com/image.png', 'javascript:alert(1)', 'data:text/html;base64,aGVsbG8='])('does not read a remote or executable source %s', (src) => expect(picturePath(src)).toBeUndefined())
  it('draws inline image data and preserves external pictures as links', () => {
    const local = renderToStaticMarkup(createElement(Prose, { text: '![Screen](data:image/png;base64,aGVsbG8=)' }))
    expect(local).toContain('<img')
    expect(local).toContain('src="data:image/png;base64,aGVsbG8="')
    const remote = renderToStaticMarkup(createElement(Prose, { text: '![Remote](https://example.com/screen.png)' }))
    expect(remote).not.toContain('<img')
    expect(remote).toContain('href="https://example.com/screen.png"')
  })
  it('preserves Windows picture paths through Markdown URL filtering', () => {
    const html = renderToStaticMarkup(createElement(Prose, { text: '![Screen](E:/probes/screen.png)' }))
    expect(html).toContain('href="E:/probes/screen.png"')
  })
  it('keeps executable markup and SVG data out of the image viewer', () => {
    expect(pictureData('data:image/svg+xml;base64,aGVsbG8=')).toBe(false)
    const html = renderToStaticMarkup(createElement(Prose, { text: '<script>alert(1)</script>\n\n![bad](javascript:alert)' }))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<img')
  })
})
