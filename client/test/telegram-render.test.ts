import { describe, expect, it } from 'vitest'

import { telegramMessages } from '../src/main/telegram-render'

const one = (source: string): string => telegramMessages(source).map((piece) => piece.html).join('\n----\n')

describe('what Manager writes, drawn with Telegram’s own formatting', () => {
  it('carries bold, italic, strikethrough, code, links and headings into Telegram HTML', () => {
    expect(one('## Done\n\n**Shipped** the *fix* in `useChat.ts`, ~~not~~ in [the panel](https://example.com/a?b=1).')).toBe('<b>Done</b>\n\n<b>Shipped</b> the <i>fix</i> in <code>useChat.ts</code>, <s>not</s> in <a href="https://example.com/a?b=1">the panel</a>.')
  })

  it('leaves the marks inside a code span alone and escapes what would be read as markup', () => {
    expect(one('Run `npm run **build**` on <main> & wait')).toBe('Run <code>npm run **build**</code> on &lt;main&gt; &amp; wait')
  })

  it('turns lists into bullets, checkboxes and kept numbers', () => {
    expect(one('- first\n- [ ] open\n- [x] closed\n1. one\n2. two')).toBe('• first\n• ☐ open\n• ☑ closed\n1. one\n2. two')
  })

  it('keeps a fenced block as code with its language, and the lines inside it as they were written', () => {
    expect(one('Look:\n\n```ts\n  const value = 1 < 2\n```')).toBe('Look:\n\n<pre><code class="language-ts">  const value = 1 &lt; 2</code></pre>')
  })

  it('pads a markdown table into a monospace block so its columns line up', () => {
    expect(one('| Worker | State |\n| --- | --- |\n| chat | working |\n| docs | idle |')).toBe('<pre>Worker  State\nchat    working\ndocs    idle</pre>')
  })

  it('quotes with a blockquote, and folds a long one so it does not fill the screen', () => {
    expect(one('> short one')).toBe('<blockquote>short one</blockquote>')
    expect(one(Array.from({ length: 12 }, (_value, at) => `> line ${String(at)}`).join('\n'))).toContain('<blockquote expandable>')
  })

  it('splits a long answer into messages Telegram accepts without cutting a tag or a surrogate pair', () => {
    const pieces = telegramMessages(`**${'A'.repeat(4000)}**\n\n😀`.replace('😀', '😀'.repeat(2000)))
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((piece) => piece.html.length <= 3500)).toBe(true)
    expect(pieces.every((piece) => !/<[a-z/]*$/.test(piece.html) && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece.html))).toBe(true)
  })

  it('keeps the plain form of every message for the fallback send', () => {
    const [piece] = telegramMessages('**Shipped** it')
    expect(piece).toEqual({ html: '<b>Shipped</b> it', text: '**Shipped** it' })
  })
})
