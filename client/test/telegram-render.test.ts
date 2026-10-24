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

  it.each(['│', '|'])('formats terminal %s rails as quotes and keeps aligned diagnostics in monospace', (rail) => {
    const source = `Approval\n\n${rail} Hook requires confirmation:\n${rail}\n${rail} FLAG  contractions  1 in 35 sentences\n${rail} ok    vocabulary    clean\n${rail}\n${rail} Read [the skill](~/.claude/skills/own-english/SKILL.md).\n\nDo you want to proceed?`
    expect(one(source)).toBe('Approval\n\n<blockquote>Hook requires confirmation:\n</blockquote>\n<pre>FLAG  contractions  1 in 35 sentences\nok    vocabulary    clean</pre>\n<blockquote>\nRead the skill (<code>~/.claude/skills/own-english/SKILL.md</code>).</blockquote>\n\nDo you want to proceed?')
    expect(telegramMessages(source)[0]?.text).toBe(source)
  })

  it('keeps literal pipes and terminal rails inside fenced code unchanged', () => {
    expect(one('A | B\n\n```text\n│ original\n│ output\n```\n\n| left | right |\n| keep | pipes |')).toBe('A | B\n\n<pre><code class="language-text">│ original\n│ output</code></pre>\n\n| left | right |\n| keep | pipes |')
  })

  it('bounds long terminal diagnostics after escaping and preserves Unicode at splits', () => {
    const source = `│ Hook output:\n│\n│ FLAG  report  ${'<&😀'.repeat(1500)}\n│ ok    status  clean\n│\n│ ${'More <&😀 '.repeat(1000)}`
    const pieces = telegramMessages(source)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((piece) => piece.html.length <= 3500 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece.text))).toBe(true)
    expect(pieces.filter((piece) => piece.html.startsWith('<pre>')).every((piece) => piece.html.endsWith('</pre>'))).toBe(true)
    expect(pieces.filter((piece) => piece.html.startsWith('<blockquote')).every((piece) => piece.html.endsWith('</blockquote>'))).toBe(true)
    const expected = source.replace(/^│ ?/gm, '').replace(/\n/g, '')
    expect(pieces.map((piece) => piece.html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&')).join('').replace(/\n/g, '')).toBe(expected)
    expect(pieces.map((piece) => piece.text.replace(/^[│>] ?/gm, '')).join('').replace(/\n/g, '')).toBe(expected)
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
